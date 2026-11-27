(() => {
const $ = id => document.getElementById(id);

function initThemeToggle(){
 const root=document.documentElement,button=$("themeToggle"),meta=document.querySelector('meta[name="theme-color"]');
 const apply=theme=>{
  const chosen=theme==="dark"?"dark":"light";
  root.dataset.theme=chosen;
  try{localStorage.setItem("lumio-theme",chosen)}catch(e){}
  if(meta)meta.setAttribute("content",chosen==="dark"?"#100e19":"#f7f6fc");
  if(button){button.textContent=chosen==="dark"?"☀ Sáng":"☾ Tối";button.setAttribute("aria-label",chosen==="dark"?"Chuyển sang giao diện sáng":"Chuyển sang giao diện tối");button.setAttribute("aria-pressed",String(chosen==="dark"))}
 };
 let saved="light";try{saved=localStorage.getItem("lumio-theme")==="dark"?"dark":"light"}catch(e){}
 apply(saved);
 if(button)button.addEventListener("click",()=>apply(root.dataset.theme==="dark"?"light":"dark"));
}
initThemeToggle();

const cfg = window.LUMIO_CONFIG || {};
const hasBackend = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const db = hasBackend ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let user = null, isLogin = false, demo = false, currentMood = "", profile = null, activeChat = null, messageChannel = null, chatRefreshTimer = null, inboxChannel = null, profileChannel = null, presenceChannel = null, presenceHeartbeat = null;
let onlineUserIds = new Set(), allPeople = [], peopleFilter = "recommended", peopleSearch = "", feedChannel = null, feedLoading = false, notificationChannel = null, activeRoom = null, roomChannel = null, typingTimer = null, remoteTypingTimer = null, typingIsOn = false;
const demoPeople = [
 {id:"demo-1",name:"Mia",age:20,country:"Việt Nam",mood:"Vui vẻ",bio:"Âm nhạc, du lịch và những cuộc trò chuyện thú vị.",initial:"M",color:"pink"},
 {id:"demo-2",name:"Alex",age:23,country:"Singapore",mood:"Khám phá",bio:"Thích game indie, cà phê và khám phá văn hóa.",initial:"A",color:"blue"},
 {id:"demo-3",name:"Yuna",age:21,country:"Nhật Bản",mood:"Chill",bio:"Một chút âm nhạc, một chút nghệ thuật.",initial:"Y",color:"gold"}
];
const questions = ["Nếu có thể đi bất cứ đâu cuối tuần này, bạn sẽ chọn nơi nào?","Bài hát nào luôn khiến tâm trạng bạn tốt hơn?","Bạn thích một buổi tối chơi game hay trò chuyện thật lâu?","Nếu có một siêu năng lực trong 24 giờ, bạn chọn gì?","Điều nhỏ bé nào khiến bạn vui hôm nay?"];
let qIndex=0;
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2600)}
function formatMessageTime(value){if(!value)return "";return new Intl.DateTimeFormat("vi-VN",{hour:"2-digit",minute:"2-digit"}).format(new Date(value))}
function formatLastSeen(value){
 if(!value)return "Chưa có hoạt động gần đây";
 const ms=Date.now()-new Date(value).getTime();
 if(!Number.isFinite(ms)||ms<0)return "Vừa hoạt động";
 const minutes=Math.floor(ms/60000);
 if(minutes<1)return "Vừa hoạt động";
 if(minutes<60)return "Hoạt động "+minutes+" phút trước";
 const hours=Math.floor(minutes/60);
 if(hours<24)return "Hoạt động "+hours+" giờ trước";
 const days=Math.floor(hours/24);
 if(days<7)return "Hoạt động "+days+" ngày trước";
 return "Hoạt động ngày "+new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(value));
}
function appendPresenceLabel(parent,id,lastSeen){
 const online=onlineUserIds.has(id);
 const status=document.createElement("span");
 status.className="presence-label "+(online?"is-online":"is-offline");
 const dot=document.createElement("i");
 dot.className="presence-dot";
 dot.setAttribute("aria-hidden","true");
 const text=document.createElement("span");
 text.textContent=online?"Online":formatLastSeen(lastSeen);
 status.append(dot,text);
 parent.append(status);
}
async function saveLastSeen(){
 if(!db||!user)return;
 const {error}=await db.from("profiles").update({last_seen_at:new Date().toISOString()}).eq("id",user.id);
 if(error)console.warn("LUMIO last_seen update failed:",error.message);
}
async function trackMyPresence(){
 if(!presenceChannel||!user||document.hidden)return;
 const {error}=await presenceChannel.track({user_id:user.id,online_at:new Date().toISOString()});
 if(error)console.warn("LUMIO presence track failed:",error.message);
}
async function setupPresenceRealtime(){
 if(!db||!user)return;
 if(presenceChannel)await db.removeChannel(presenceChannel);
 if(presenceHeartbeat)clearInterval(presenceHeartbeat);
 presenceChannel=db.channel("lumio-global-presence",{config:{presence:{key:user.id}}})
  .on("presence",{event:"sync"},()=>{
   const state=presenceChannel.presenceState();
   onlineUserIds=new Set(Object.values(state).flat().map(x=>x.user_id).filter(Boolean));
   renderPeople();loadMatches();if(activeRoom)loadRoomMembers();
  })
  .subscribe(async status=>{
   if(status==="SUBSCRIBED"){
    await trackMyPresence();
    await saveLastSeen();
   }
  });
 presenceHeartbeat=setInterval(()=>{if(!document.hidden)saveLastSeen()},120000);
}

async function refreshUnreadBadge(){
 if(!db||!user)return;
 const {count,error}=await db.from("messages").select("id",{count:"exact",head:true}).eq("receiver_id",user.id).is("read_at",null);
 if(error)return;
 const tab=document.querySelector('.tab[data-tab="messages"]');
 const badge=$("messageUnreadCount");
 if(tab){
  tab.classList.toggle("has-unread",!!count);
  tab.setAttribute("aria-label",count?("Tin nhắn, "+count+" tin chưa đọc"):"Tin nhắn");
 }
 if(badge){
  badge.textContent=count>99?"99+":String(count||"");
  badge.classList.toggle("hidden",!count);
 }
}
async function refreshNotificationBadge(){
 if(!db||!user)return;
 const {count,error}=await db.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_id",user.id).is("read_at",null);
 if(error)return;
 const tab=document.querySelector('.tab[data-tab="notifications"]'),badge=$("notificationUnreadCount");
 if(tab)tab.classList.toggle("has-unread",!!count);
 if(badge){badge.textContent=count>99?"99+":String(count||"");badge.classList.toggle("hidden",!count)}
}
async function loadNotifications(){
 const root=$("notificationsList");if(!root)return;
 if(!db||!user){root.innerHTML='<div class="feed-empty"><span>♧</span><strong>Thông báo đang chờ bạn</strong><small>Đăng nhập để xem lượt thích, bình luận và kết nối mới.</small></div>';return}
 root.innerHTML='<p class="notice">Đang tải thông báo...</p>';
 const {data:items,error}=await db.from("notifications").select("id,actor_id,type,post_id,created_at,read_at").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
 if(error){root.innerHTML='<p class="notice">Chưa tải được thông báo: '+escapeText(error.message)+'</p>';return}
 if(!items?.length){root.innerHTML='<div class="feed-empty"><span>✧</span><strong>Bạn chưa có thông báo mới</strong><small>Khi có người thích, bình luận hoặc kết nối với bạn, thông báo sẽ xuất hiện ở đây.</small></div>';await refreshNotificationBadge();return}
 const actorIds=[...new Set(items.map(x=>x.actor_id))];
 const {data:people,error:profileError}=await db.from("profiles").select("id,display_name,avatar_url").in("id",actorIds);
 if(profileError)console.warn("LUMIO notification profiles failed:",profileError.message);
 const profiles=new Map((people||[]).map(p=>[p.id,p]));
 root.innerHTML="";
 items.forEach(item=>{
  const actor=profiles.get(item.actor_id)||{},name=actor.display_name||"Một thành viên";
  const card=document.createElement("button");card.type="button";card.className="notification-item"+(item.read_at?"":" unread");
  const avatar=document.createElement("span");avatar.className="avatar notification-avatar";paintAvatar(avatar,actor.avatar_url,name);
  const body=document.createElement("span");body.className="notification-body";
  const message=document.createElement("strong");
  message.textContent=item.type==="post_like"?name+" đã thích bài viết của bạn":item.type==="post_comment"?name+" đã bình luận bài viết của bạn":name+" và bạn đã kết nối với nhau";
  const time=document.createElement("small");time.textContent=formatPostTime(item.created_at);
  body.append(message,time);const marker=document.createElement("i");marker.className="notification-marker";card.append(avatar,body,marker);
  card.onclick=()=>openNotification(item);root.append(card);
 });
 await refreshNotificationBadge();
}
async function openNotification(item){
 if(!db||!user)return;
 if(!item.read_at){const {error}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",item.id).eq("recipient_id",user.id).is("read_at",null);if(error)console.warn("LUMIO mark notification read failed:",error.message)}
 await loadNotifications();
 if(item.post_id){switchTab("feed");await loadFeed();setTimeout(()=>{const card=document.querySelector('[data-post-id="'+item.post_id+'"]');card?.scrollIntoView({behavior:"smooth",block:"center"})},150)}
 else if(item.type==="match"){switchTab("messages");loadMatches()}
}
async function markAllNotificationsRead(){
 if(!db||!user)return;
 const {error}=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",user.id).is("read_at",null);
 if(error){toast("Chưa cập nhật được thông báo: "+error.message);return}
 await loadNotifications();toast("Đã đánh dấu tất cả là đã đọc");
}
function setupNotificationsRealtime(){
 if(!db||!user)return;
 if(notificationChannel)db.removeChannel(notificationChannel);
 notificationChannel=db.channel("lumio-notifications-"+user.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"recipient_id=eq."+user.id},()=>{
   loadNotifications();refreshNotificationBadge();toast("Bạn có thông báo mới ♧");
  }).subscribe();
 loadNotifications();refreshNotificationBadge();
}
async function markChatRead(){
 if(!db||!user||!activeChat)return;
 const {error}=await db.from("messages").update({read_at:new Date().toISOString()}).eq("sender_id",activeChat.id).eq("receiver_id",user.id).is("read_at",null);
 if(!error)refreshUnreadBadge();else console.warn("LUMIO read receipt update failed:",error.message);
}
function setupInboxRealtime(){
 if(!db||!user)return;
 if(inboxChannel)db.removeChannel(inboxChannel);
 inboxChannel=db.channel("lumio-inbox-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"receiver_id=eq."+user.id},payload=>{
  const m=payload.new;
  if(activeChat&&activeChat.id===m.sender_id){markChatRead();loadChatMessages();}
  else {toast("Bạn vừa nhận được tin nhắn mới ✉");refreshUnreadBadge();}
 }).subscribe();
 refreshUnreadBadge();
}
function setupProfileRealtime(){
 if(!db||!user)return;
 if(profileChannel)db.removeChannel(profileChannel);
 profileChannel=db.channel("lumio-profiles-"+user.id).on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles"},payload=>{
  if(payload.new?.id===user.id){
   const current=profile||{};
   const changed=payload.new?.display_name!==(current.name||"")||payload.new?.bio!==(current.bio||"")||payload.new?.country!==(current.country||"Việt Nam")||payload.new?.interests!==(current.interests||"")||payload.new?.avatar_url!==(current.avatar_url||"");
   if(changed)syncProfileFromServer();
   return;
  }
  renderPeople();loadMatches();
 }).subscribe();
}
function showApp(){ $("welcome").classList.add("hidden");$("app").classList.remove("hidden");$("authButton").textContent=user?"Tài khoản":"Đăng nhập";loadProfile();syncProfileFromServer();renderPeople();loadMatches();loadFeed();setupFeedRealtime();setupInboxRealtime();setupNotificationsRealtime();setupProfileRealtime();setupPresenceRealtime();paintAvatar($("composerAvatar"),profile?.avatar_url,profile?.name);}
function showWelcome(){ $("app").classList.add("hidden");$("welcome").classList.remove("hidden");}
function openAuth(login=false){isLogin=login;$("authTitle").textContent=login?"Đăng nhập LUMIO":"Tạo tài khoản LUMIO";$("authHint").textContent=login?"Chào mừng bạn quay trở lại.":"Đăng ký để tạo hồ sơ và bắt đầu kết nối."; $("authSubmit").textContent=login?"Đăng nhập":"Tạo tài khoản";$("switchAuth").textContent=login?"Chưa có tài khoản? Đăng ký":"Đã có tài khoản? Đăng nhập";$("authMessage").textContent="";$("authModal").classList.remove("hidden")}
function closeAuth(){$("authModal").classList.add("hidden")}
function escapeText(s){return String(s??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[c]))}
function paintAvatar(el,url,name){
 if(!el)return;el.innerHTML="";
 if(url){const img=document.createElement("img");img.src=url;img.alt="Ảnh đại diện";img.loading="lazy";el.append(img)}
 else el.textContent=(name||"L").slice(0,1).toUpperCase();
}
function loadProfile(){let p=JSON.parse(localStorage.getItem("lumio_profile")||"{}");profile=p;$("displayName").value=p.name||user?.email?.split("@")[0]||"Lumio Member";$("bio").value=p.bio||"";$("country").value=p.country||"Việt Nam";$("interests").value=p.interests||"";$("greeting").textContent="Xin chào, "+(p.name||"bạn")+" ✨";paintAvatar($("myAvatar"),p.avatar_url,p.name);paintAvatar($("profileAvatarPreview"),p.avatar_url,p.name)}
async function syncProfileFromServer(){
 if(!db||!user)return;
 const {data,error}=await db.from("profiles").select("display_name,bio,country,interests,avatar_url").eq("id",user.id).maybeSingle();
 if(error||!data)return;
 const p={...(JSON.parse(localStorage.getItem("lumio_profile")||"{}")),name:data.display_name||"",bio:data.bio||"",country:data.country||"Việt Nam",interests:data.interests||"",avatar_url:data.avatar_url||""};
 profile=p;localStorage.setItem("lumio_profile",JSON.stringify(p));window.__lumioProfileNames=window.__lumioProfileNames||new Map();window.__lumioProfileNames.set(user.id,p.name||"Lumio Member");loadProfile();
}
async function uploadAvatar(file){
 const status=$("avatarStatus");
 const say=msg=>{if(status)status.textContent=msg};
 if(!file||!db||!user){say("Hãy đăng nhập để tải ảnh đại diện.");toast("Hãy đăng nhập để tải ảnh đại diện.");return}
 const name=(file.name||"").toLowerCase();
 let mime=file.type||"";
 if(!mime.startsWith("image/")){
  if(name.endsWith(".heic"))mime="image/heic";
  else if(name.endsWith(".heif"))mime="image/heif";
  else if(name.endsWith(".png"))mime="image/png";
  else if(name.endsWith(".webp"))mime="image/webp";
  else if(name.endsWith(".jpg")||name.endsWith(".jpeg"))mime="image/jpeg";
 }
 const allowed={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"};
 if(!allowed[mime]){say("Định dạng ảnh chưa hỗ trợ. Hãy chọn JPG, PNG, WebP hoặc HEIC.");toast("Định dạng ảnh chưa hỗ trợ.");return}
 if(file.size>5*1024*1024){say("Ảnh vượt quá 5 MB.");toast("Ảnh tối đa 5 MB.");return}
 const ext=allowed[mime],path=user.id+"/avatar."+ext,picker=$("avatarFile");
 picker.disabled=true;say("Đang tải ảnh lên...");
 const previewUrl=URL.createObjectURL(file);
 paintAvatar($("profileAvatarPreview"),previewUrl,$("displayName").value.trim());
 try{
  const {error:upErr}=await db.storage.from("lumio-avatars").upload(path,file,{upsert:true,contentType:mime,cacheControl:"3600"});
  if(upErr)throw upErr;
  const {data}=db.storage.from("lumio-avatars").getPublicUrl(path);
  const avatar_url=data.publicUrl+"?v="+Date.now();
  const p={...(profile||{}),name:$("displayName").value.trim(),bio:$("bio").value.trim(),country:$("country").value.trim(),interests:$("interests").value.trim(),avatar_url};
  const {error:saveErr}=await db.from("profiles").upsert({id:user.id,display_name:p.name||user.email?.split("@")[0]||"Lumio Member",bio:p.bio,country:p.country,interests:p.interests,avatar_url,updated_at:new Date().toISOString()});
  if(saveErr)throw saveErr;
  profile=p;localStorage.setItem("lumio_profile",JSON.stringify(p));loadProfile();await renderPeople();await loadMatches();say("Ảnh đại diện đã được cập nhật.");toast("Đã cập nhật ảnh đại diện!");
 }catch(err){loadProfile();say("Tải ảnh thất bại: "+err.message);toast("Chưa tải được ảnh: "+err.message)}
 finally{URL.revokeObjectURL(previewUrl);picker.disabled=false;picker.value=""}
}
function normalizeSearch(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function renderFilteredPeople(){
 const list=$("people");if(!list)return;
 const query=normalizeSearch(peopleSearch);
 const ownInterests=normalizeSearch(profile?.interests||"").split(/[,;·]/).map(x=>x.trim()).filter(Boolean);
 let people=allPeople.filter(p=>{
  const haystack=normalizeSearch([p.name,p.country,p.mood,p.bio,p.interests].join(" "));
  if(query&&!haystack.includes(query))return false;
  if(peopleFilter==="interests"&&ownInterests.length){
   const theirs=normalizeSearch(p.interests||p.bio||"");
   if(!ownInterests.some(item=>theirs.includes(item)))return false;
  }else if(peopleFilter==="interests"&&!ownInterests.length&&currentMood){
   if(p.mood!==currentMood)return false;
  }
  return true;
 });
 if(peopleFilter==="recommended")people.sort((a,b)=>{
  const score=p=>(p.mood&&p.mood===currentMood?2:0)+(ownInterests.some(x=>normalizeSearch(p.interests||p.bio).includes(x))?1:0);
  return score(b)-score(a);
 });
 list.innerHTML="";
 const count=$("peopleResultCount");
 if(count)count.textContent=people.length+" thành viên"+(peopleSearch?" phù hợp với “"+peopleSearch+"”":"");
 if(!people.length){
  list.innerHTML='<div class="people-empty"><span>⌕</span><strong>Chưa tìm thấy thành viên phù hợp</strong><small>Thử từ khóa khác hoặc đổi bộ lọc nhé.</small><button class="secondary small" id="resetPeopleFilters" type="button">Xóa bộ lọc</button></div>';
  $("resetPeopleFilters")?.addEventListener("click",()=>{peopleSearch="";peopleFilter="recommended";$("peopleSearch").value="";updatePeopleFilterUI();renderFilteredPeople()});
  return;
 }
 people.forEach(p=>renderPersonCard(p,list,!!p.isDemo));
}
function updatePeopleFilterUI(){
 document.querySelectorAll("#peopleFilters .chip").forEach(button=>button.classList.toggle("selected",button.dataset.peopleFilter===peopleFilter));
 const clear=$("clearPeopleSearch");if(clear)clear.classList.toggle("hidden",!peopleSearch);
}
async function renderPeople(){
 const list=$("people");if(!list)return;
 if(!db||!user){
  allPeople=demoPeople.map(p=>({...p,isDemo:true,interests:p.bio}));
  renderFilteredPeople();return;
 }
 list.innerHTML='<p class="notice">Đang tìm những người dùng LUMIO...</p>';
 const [{data,error},{data:blocks, error:blockError}]=await Promise.all([
  db.from("profiles").select("id,display_name,bio,country,interests,mood,avatar_url,created_at,last_seen_at").neq("id",user.id).order("created_at",{ascending:false}).limit(100),
  db.from("user_blocks").select("blocked_id").eq("blocker_id",user.id)
 ]);
 if(error||blockError){list.innerHTML="";toast("Không tải được danh sách thành viên.");return}
 const blockedIds=new Set((blocks||[]).map(x=>x.blocked_id));
 allPeople=(data||[]).filter(p=>!blockedIds.has(p.id)).map(p=>({id:p.id,name:p.display_name||"Lumio Member",country:p.country||"Chưa cập nhật quốc gia",mood:p.mood||"Chưa cập nhật tâm trạng",bio:p.bio||p.interests||"Đang khám phá LUMIO",interests:p.interests||"",initial:(p.display_name||"L").slice(0,1).toUpperCase(),avatar_url:p.avatar_url,last_seen_at:p.last_seen_at}));
 renderFilteredPeople();
}
let reportTargetId=null;
function openReportModal(id,name){if(!db||!user){toast("Đăng nhập để gửi báo cáo.");return}reportTargetId=id;$("reportTargetName").textContent="Báo cáo thành viên: "+name;$("reportDetails").value="";$("reportStatus").textContent="";$("reportModal").classList.remove("hidden");$("reportCategory").focus()}
function closeReportModal(){$("reportModal").classList.add("hidden");reportTargetId=null}
async function submitUserReport(e){e.preventDefault();if(!db||!user||!reportTargetId)return;const button=$("submitReport"),details=$("reportDetails").value.trim();if(details.length<8){$("reportStatus").textContent="Vui lòng mô tả ít nhất 8 ký tự.";return}button.disabled=true;button.textContent="Đang gửi...";const {error}=await db.from("user_reports").insert({reporter_id:user.id,reported_user_id:reportTargetId,category:$("reportCategory").value,details});button.disabled=false;button.textContent="Gửi báo cáo";if(error){$("reportStatus").textContent="Chưa gửi được. Vui lòng thử lại.";return}closeReportModal();toast("Đã gửi báo cáo. Cảm ơn bạn đã giúp LUMIO an toàn hơn.")}
async function loadBlockedUsers(){const root=$("blockedUsersList");if(!root)return;if(!db||!user){root.innerHTML='<p class="notice">Đăng nhập để quản lý danh sách đã chặn.</p>';return}root.innerHTML='<p class="notice">Đang tải danh sách...</p>';const {data:blocks,error}=await db.from("user_blocks").select("blocked_id,created_at").eq("blocker_id",user.id).order("created_at",{ascending:false});if(error){root.innerHTML='<p class="notice">Chưa tải được danh sách đã chặn.</p>';return}if(!blocks?.length){root.innerHTML='<p class="notice">Bạn chưa chặn thành viên nào.</p>';return}const ids=blocks.map(x=>x.blocked_id),{data:people}=await db.from("profiles").select("id,display_name,avatar_url").in("id",ids),map=new Map((people||[]).map(x=>[x.id,x]));root.innerHTML="";blocks.forEach(item=>{const p=map.get(item.blocked_id)||{},row=document.createElement("div");row.className="blocked-user-row";const av=document.createElement("span");av.className="avatar";paintAvatar(av,p.avatar_url,p.display_name||"L");const name=document.createElement("strong");name.textContent=p.display_name||"Thành viên LUMIO";const btn=document.createElement("button");btn.type="button";btn.className="secondary small";btn.textContent="Bỏ chặn";btn.onclick=async()=>{btn.disabled=true;const {error}=await db.from("user_blocks").delete().eq("blocker_id",user.id).eq("blocked_id",item.blocked_id);if(error){btn.disabled=false;toast("Chưa bỏ chặn được.");return}row.remove();await renderPeople();toast("Đã bỏ chặn thành viên.");if(!root.children.length)root.innerHTML='<p class="notice">Bạn chưa chặn thành viên nào.</p>'};row.append(av,name,btn);root.append(row)})}
function renderPersonCard(p,list,isDemo){
 const el=document.createElement("article");el.className="person";
 const top=document.createElement("div");top.className="person-top";
 const avatar=document.createElement("div");avatar.className="person-avatar";if(p.avatar_url){const img=document.createElement("img");img.src=p.avatar_url;img.alt="Ảnh đại diện";avatar.append(img)}else avatar.textContent=p.initial||"L";
 const info=document.createElement("div");const name=document.createElement("h4");name.textContent=p.name;const meta=document.createElement("small");meta.textContent=p.country+" · "+p.mood;info.append(name,meta);if(!isDemo)appendPresenceLabel(info,p.id,p.last_seen_at);top.append(avatar,info);
 const bio=document.createElement("p");bio.textContent=p.bio;
 const actions=document.createElement("div");actions.className="person-actions";
 const pass=document.createElement("button");pass.className="pass";pass.textContent="Bỏ qua";pass.onclick=()=>el.remove(); const report=document.createElement("button");report.className="safety-action";report.type="button";report.textContent="Báo cáo";report.onclick=()=>openReportModal(p.id,p.name);
  const block=document.createElement("button");block.className="safety-action";block.type="button";block.textContent="Chặn";
  block.onclick=async()=>{if(isDemo||!user){toast("Đăng nhập để chặn thành viên.");return}if(!window.confirm("Chặn "+p.name+"? Thành viên này sẽ bị ẩn khỏi Khám phá và hộp thư của bạn."))return;const {error}=await db.from("user_blocks").insert({blocker_id:user.id,blocked_id:p.id});if(error){toast(error.code==="23505"?"Bạn đã chặn thành viên này rồi.":"Chưa chặn được thành viên.");return}el.remove();allPeople=allPeople.filter(x=>x.id!==p.id);await loadMatches();toast("Đã chặn thành viên.")};
  const like=document.createElement("button");like.className="like";like.textContent="♥ Kết nối";
 like.onclick=async()=>{
  if(isDemo){toast("Đây là hồ sơ demo; đăng nhập và chờ thành viên thật để kết nối.");return}
  like.disabled=true;
  const {error:insertError}=await db.from("likes").insert({from_user:user.id,to_user:p.id});
  if(insertError){
   if(insertError.code==="23505")toast("Bạn đã gửi lời thích cho người này rồi.");
   else toast("Chưa gửi được lời thích: "+insertError.message);
   like.disabled=false;return;
  }
  const {data:backLike}=await db.from("likes").select("id").eq("from_user",p.id).eq("to_user",user.id).maybeSingle();
  if(backLike){
   like.textContent="✓ Đã tương hợp";
   toast("Hai bạn đã thích nhau! Đã mở kết nối mới.");
   await loadMatches();
  } else {
   like.textContent="✓ Đã gửi";
   toast("Đã gửi lời thích! Chờ người ấy phản hồi nhé.");
  }
 };
 actions.append(pass,like);if(!isDemo){actions.append(report,block)}el.append(top,bio,actions);list.appendChild(el);
}

function renderRoomMessage(message,author){
 const root=$("roomChatMessages");if(!root)return;
 const mine=message.sender_id===user?.id,person=typeof author==="object"&&author?author:{display_name:author||"Thành viên"};
 const wrap=document.createElement("div");wrap.className="room-message "+(mine?"mine":"theirs");
 const avatar=document.createElement("span");avatar.className="room-message-avatar";paintAvatar(avatar,person.avatar_url,mine?"Bạn":person.display_name||"Thành viên");
 const content=document.createElement("div");content.className="room-message-content";
 const name=document.createElement("b");name.textContent=mine?"Bạn":person.display_name||"Thành viên";
 const body=document.createElement("p");body.textContent=message.body;
 const time=document.createElement("small");time.textContent=formatMessageTime(message.created_at);
 content.append(name,body,time);wrap.append(avatar,content);root.append(wrap);root.scrollTop=root.scrollHeight;
}
async function loadRoomMembers(){
 const root=$("roomChatMembers");if(!root||!activeRoom||!db)return;
 const {data:members,error}=await db.from("room_members").select("user_id").eq("room_id",activeRoom.id);
 if(error){root.textContent="Không tải được thành viên";return}
 const ids=[...new Set((members||[]).map(x=>x.user_id))];
 const {data:people}=ids.length?await db.from("profiles").select("id,display_name,avatar_url,last_seen_at").in("id",ids):{data:[]};
 const byId=new Map((people||[]).map(p=>[p.id,p]));root.innerHTML="";
 const heading=document.createElement("strong");heading.className="room-members-count";heading.textContent=ids.length+" thành viên";root.append(heading);
 ids.forEach(id=>{const p=byId.get(id)||{},item=document.createElement("div");item.className="room-member";const av=document.createElement("span");av.className="room-member-avatar";paintAvatar(av,p.avatar_url,p.display_name||"L");const label=document.createElement("span");label.textContent=p.display_name||"Thành viên";const status=document.createElement("i");const online=onlineUserIds.has(id);status.className="room-member-dot "+(online?"online":"");status.title=online?"Đang online":formatLastSeen(p.last_seen_at);item.append(av,label,status);root.append(item)});
}
async function loadRooms(){
 const root=$("roomList");if(!root)return;
 $("roomChatPanel").classList.add("hidden");root.classList.remove("hidden");
 if(!db||!user){root.innerHTML='<p class="notice">Đăng nhập để tham gia phòng trò chuyện LUMIO.</p>';return}
 root.innerHTML='<p class="notice">Đang tải các phòng...</p>';
 const [{data:rooms,error},{data:members}] = await Promise.all([
  db.from("chat_rooms").select("id,name,description,icon").order("name"),
  db.from("room_members").select("room_id,user_id")
 ]);
 if(error){root.innerHTML='<p class="notice">Không tải được phòng: '+escapeText(error.message)+'</p>';return}
 const joined=new Set((members||[]).filter(x=>x.user_id===user.id).map(x=>x.room_id));
 root.innerHTML="";
 (rooms||[]).forEach(room=>{
  const card=document.createElement("article");card.className="room";
  const icon=document.createElement("div");icon.className="room-icon "+(room.id==="chill-music"?"pink":room.id==="global-lounge"?"blue":"gold");icon.textContent=room.icon;
  const info=document.createElement("div");const title=document.createElement("b");title.textContent=room.name;const desc=document.createElement("small");desc.textContent=room.description;info.append(title,desc);
  const count=document.createElement("span");count.textContent=(members||[]).filter(x=>x.room_id===room.id).length+" người";
  const action=document.createElement("button");action.className="primary small";action.type="button";action.textContent=joined.has(room.id)?"Vào phòng":"Tham gia";
  action.onclick=()=>joined.has(room.id)?openRoom(room):joinRoom(room);
  card.append(icon,info,count,action);root.append(card);
 });
 if(!rooms?.length)root.innerHTML='<p class="notice">Chưa có phòng nào.</p>';
}
async function joinRoom(room){
 const {error}=await db.from("room_members").insert({room_id:room.id,user_id:user.id});
 if(error&&error.code!=="23505"){toast("Chưa tham gia được phòng: "+error.message);return}
 await openRoom(room);
}
async function openRoom(room){
 activeRoom=room;
 $("view-rooms").classList.add("room-chat-active");$("app").classList.add("room-focus-active");
 $("roomList").classList.add("hidden");$("roomChatPanel").classList.remove("hidden");
 $("roomChatTitle").textContent=room.name;$("roomChatSubtitle").textContent=room.description;
 $("roomChatMessages").innerHTML='<p class="notice">Đang tải tin nhắn...</p>';
 if(roomChannel){await db.removeChannel(roomChannel);roomChannel=null}
 const {data,error}=await db.from("room_messages").select("id,room_id,sender_id,body,created_at").eq("room_id",room.id).order("created_at",{ascending:true}).limit(100);
 const root=$("roomChatMessages");root.innerHTML="";
 if(error){root.textContent="Không tải được tin nhắn: "+error.message;return}
 const ids=[...new Set((data||[]).map(x=>x.sender_id))];
 const {data:profiles}=ids.length?await db.from("profiles").select("id,display_name,avatar_url").in("id",ids):{data:[]};
 const people=new Map((profiles||[]).map(x=>[x.id,x]));
 (data||[]).forEach(m=>renderRoomMessage(m,people.get(m.sender_id)));
 if(!data?.length)root.innerHTML='<p class="notice">Phòng vừa mở cửa! Hãy gửi lời chào đầu tiên.</p>';
 await loadRoomMembers();
 roomChannel=db.channel("lumio-room-"+room.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"room_messages",filter:"room_id=eq."+room.id},async payload=>{
  if(payload.new.sender_id===user.id)return;
  const {data:p}=await db.from("profiles").select("display_name,avatar_url").eq("id",payload.new.sender_id).maybeSingle();
  renderRoomMessage(payload.new,p);
 }).subscribe();
}
async function sendRoomMessage(event){
 event.preventDefault();if(!activeRoom||!user)return;
 const input=$("roomChatInput"),body=input.value.trim();if(!body)return;
 $("sendRoomMessage").disabled=true;
 const {error}=await db.from("room_messages").insert({room_id:activeRoom.id,sender_id:user.id,body});
 $("sendRoomMessage").disabled=false;
 if(error){toast(error.code==="42501"?"Không thể gửi tin nhắn vì cuộc trò chuyện đang bị chặn.":"Chưa gửi được tin nhắn: "+error.message);return}
 input.value="";
 const {data:p}=await db.from("profiles").select("display_name,avatar_url").eq("id",user.id).maybeSingle();
 const {data:latest}=await db.from("room_messages").select("id,room_id,sender_id,body,created_at").eq("room_id",activeRoom.id).eq("sender_id",user.id).order("created_at",{ascending:false}).limit(1);
 if(latest?.[0])renderRoomMessage(latest[0],p);
}
async function loadMatches(){
 const root=$("messagesList"); if(!root)return;
 if(!db||!user){root.textContent="Đăng nhập để xem các kết nối thật.";return}
 root.textContent="Đang tải kết nối...";
 const {data:matches,error}=await db.from("matches").select("user1,user2,created_at").or("user1.eq."+user.id+",user2.eq."+user.id).order("created_at",{ascending:false});
 if(error){root.textContent="Chưa tải được kết nối. Hãy chạy bản cập nhật SQL trong Supabase. Chi tiết: "+error.message;return}
 if(!matches?.length){root.textContent="Chưa có tương hợp hai chiều. Khi bạn và một thành viên cùng thích nhau, cuộc trò chuyện sẽ xuất hiện ở đây.";return}
 const ids=matches.map(m=>m.user1===user.id?m.user2:m.user1);
 const {data:blocks}=await db.from("user_blocks").select("blocked_id").eq("blocker_id",user.id);
 const blockedIds=new Set((blocks||[]).map(x=>x.blocked_id));
 const visibleMatches=matches.filter(m=>!blockedIds.has(m.user1===user.id?m.user2:m.user1));
 const visibleIds=visibleMatches.map(m=>m.user1===user.id?m.user2:m.user1);
 if(!visibleMatches.length){root.textContent="Chưa có cuộc trò chuyện nào.";return}
 const {data:profiles,error:profileError}=await db.from("profiles").select("id,display_name,country,avatar_url,last_seen_at").in("id",visibleIds);
 if(profileError){root.textContent="Không tải được hồ sơ kết nối: "+profileError.message;return}
 const {data:recentMessages,messageError}=await db.from("messages").select("id,sender_id,receiver_id,body,created_at,read_at").or("sender_id.eq."+user.id+",receiver_id.eq."+user.id).order("created_at",{ascending:false}).limit(500);
 const latestByUser=new Map(),unreadByUser=new Map();
 (recentMessages||[]).forEach(msg=>{
  const other=msg.sender_id===user.id?msg.receiver_id:msg.sender_id;
  if(!latestByUser.has(other))latestByUser.set(other,msg);
  if(msg.receiver_id===user.id&&!msg.read_at)unreadByUser.set(other,(unreadByUser.get(other)||0)+1);
 });
 root.innerHTML="";
 visibleMatches.sort((a,b)=>{
  const aId=a.user1===user.id?a.user2:a.user1,bId=b.user1===user.id?b.user2:b.user1;
  const aTime=latestByUser.get(aId)?.created_at||a.created_at,bTime=latestByUser.get(bId)?.created_at||b.created_at;
  return new Date(bTime)-new Date(aTime);
 });
 visibleMatches.forEach(m=>{
  const other=m.user1===user.id?m.user2:m.user1, p=(profiles||[]).find(x=>x.id===other)||{},last=latestByUser.get(other),unread=unreadByUser.get(other)||0;
  const b=document.createElement("button");b.className="match-row message-thread"+(unread?" has-unread":"");b.type="button";
  const av=document.createElement("span");av.className="match-avatar";if(p.avatar_url){const img=document.createElement("img");img.src=p.avatar_url;img.alt="Ảnh đại diện";av.append(img)}else av.textContent=(p.display_name||"L").slice(0,1).toUpperCase();
  const label=document.createElement("span");label.className="match-label";
  const strong=document.createElement("b");strong.textContent=p.display_name||"Lumio Member";
  const preview=document.createElement("small");preview.className="thread-preview";
  preview.textContent=last?(last.sender_id===user.id?"Bạn: ":"")+last.body:"Bắt đầu cuộc trò chuyện";
  label.append(strong,preview);appendPresenceLabel(label,other,p.last_seen_at);
  const meta=document.createElement("span");meta.className="thread-meta";
  const time=document.createElement("small");time.className="thread-time";time.textContent=last?formatMessageTime(last.created_at):"Mới";
  meta.append(time);
  if(unread){const badge=document.createElement("span");badge.className="thread-unread";badge.textContent=unread>99?"99+":String(unread);meta.append(badge)}
  b.append(av,label,meta);b.onclick=()=>openChat(other,p.display_name||"Lumio Member");root.append(b);
 });
}
async function openChat(otherId,name){
 if(!db||!user)return;
 activeChat={id:otherId,name};
 $("messagesList").classList.add("hidden");
 $("chatPanel").classList.remove("hidden");
 $("chatTitle").textContent=name;
 $("chatMessages").textContent="Đang tải tin nhắn...";
 await loadChatMessages();
 if(messageChannel)db.removeChannel(messageChannel);
 const pairKey=[user.id,otherId].sort().join("-");
 $("chatTypingIndicator").classList.add("hidden");
 messageChannel=db.channel("lumio-chat-"+pairKey)
  .on("broadcast",{event:"typing"},payload=>{
   if(!activeChat||activeChat.id!==otherId||payload.payload?.sender_id===user.id)return;
   const indicator=$("chatTypingIndicator");
   indicator.classList.toggle("hidden",!payload.payload?.typing);
   if(remoteTypingTimer)clearTimeout(remoteTypingTimer);
   if(payload.payload?.typing)remoteTypingTimer=setTimeout(()=>indicator.classList.add("hidden"),2200);
  })
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
   const m=payload.new;if(activeChat&&((m.sender_id===user.id&&m.receiver_id===activeChat.id)||(m.sender_id===activeChat.id&&m.receiver_id===user.id)))loadChatMessages();
  }).subscribe();
 // Dự phòng khi Realtime trên Safari/iPhone bị trễ hoặc mất kết nối.
 if(chatRefreshTimer)clearInterval(chatRefreshTimer);
 chatRefreshTimer=setInterval(()=>{if(activeChat&&!document.hidden)loadChatMessages()},3000);
}
async function loadChatMessages(){
 if(!activeChat||!db||!user)return;
 const other=activeChat.id;
 const filter="and(sender_id.eq."+user.id+",receiver_id.eq."+other+"),and(sender_id.eq."+other+",receiver_id.eq."+user.id+")";
 const {data,error}=await db.from("messages").select("id,sender_id,receiver_id,body,created_at,read_at").or(filter).order("created_at",{ascending:true}).limit(200);
 const root=$("chatMessages");if(error){root.textContent=error.code==="42501"?"Cuộc trò chuyện này hiện bị hạn chế do một trong hai tài khoản đã chặn tài khoản còn lại.":"Không tải được tin nhắn: "+error.message;return}
 root.innerHTML="";
 if(!data?.length){root.textContent="Hai bạn đã tương hợp! Hãy gửi lời chào đầu tiên.";return}
 data.forEach(m=>{
  const wrap=document.createElement("div");wrap.className="chat-message "+(m.sender_id===user.id?"mine":"theirs");
  const bubble=document.createElement("div");bubble.className="chat-bubble "+(m.sender_id===user.id?"mine":"theirs");bubble.textContent=m.body;
  const meta=document.createElement("small");meta.className="message-meta";meta.textContent=formatMessageTime(m.created_at)+(m.sender_id===user.id?(m.read_at?" · Đã xem":" · Đã gửi"):"");
  wrap.append(bubble,meta);root.append(wrap);
 });
 root.scrollTop=root.scrollHeight;
 await markChatRead();
}
async function sendChatMessage(e){
 e.preventDefault();if(!activeChat||!db||!user)return;
 const input=$("chatInput"),body=input.value.trim();if(!body)return;
 $("sendChat").disabled=true;
 const {error}=await db.from("messages").insert({sender_id:user.id,receiver_id:activeChat.id,body});
 $("sendChat").disabled=false;
 if(error){toast("Chưa gửi được tin nhắn: "+error.message);return}
 input.value="";if(typingTimer)clearTimeout(typingTimer);typingIsOn=false;if(messageChannel)messageChannel.send({type:"broadcast",event:"typing",payload:{sender_id:user.id,typing:false}});await loadChatMessages();
}


function setPostImagePreview(file){
 const root=$("postImagePreview");root.innerHTML="";
 if(!file){root.classList.add("hidden");$("postImageStatus").textContent="Tối đa 8 MB · JPG, PNG, WebP";return}
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){$("postImage").value="";$("postImageStatus").textContent="Ảnh không hợp lệ hoặc vượt quá 8 MB.";toast("Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB.");root.classList.add("hidden");return}
 const img=document.createElement("img");img.src=URL.createObjectURL(file);img.alt="Xem trước ảnh bài viết";root.append(img);
 const remove=document.createElement("button");remove.type="button";remove.className="remove-post-image";remove.textContent="×";remove.setAttribute("aria-label","Bỏ ảnh");remove.onclick=()=>{$("postImage").value="";setPostImagePreview(null)};root.append(remove);
 root.classList.remove("hidden");$("postImageStatus").textContent=file.name;
}
async function publishPost(event){
 event.preventDefault();
 if(!db||!user){toast("Hãy đăng nhập để đăng bài.");openAuth(true);return}
 const content=$("postContent").value.trim(),file=$("postImage").files?.[0];
 if(!content&&!file){toast("Hãy viết nội dung hoặc chọn một ảnh.");return}
 const button=$("publishPost");button.disabled=true;button.textContent="Đang đăng...";
 let image_url=null,uploadedPath=null;
 try{
  if(file){
   if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024)throw new Error("Ảnh phải là JPG, PNG hoặc WebP và tối đa 8 MB.");
   const ext=file.type==="image/jpeg"?"jpg":file.type==="image/png"?"png":"webp";
   uploadedPath=user.id+"/"+crypto.randomUUID()+"."+ext;
   const {error:uploadError}=await db.storage.from("lumio-posts").upload(uploadedPath,file,{contentType:file.type,cacheControl:"3600"});
   if(uploadError)throw uploadError;
   image_url=db.storage.from("lumio-posts").getPublicUrl(uploadedPath).data.publicUrl;
  }
  const {error}=await db.from("posts").insert({author_id:user.id,content,image_url});
  if(error)throw error;
  $("postContent").value="";$("postImage").value="";setPostImagePreview(null);toast("Đã đăng bài lên LUMIO!");await loadFeed();
 }catch(error){
  if(uploadedPath)await db.storage.from("lumio-posts").remove([uploadedPath]);
  toast("Chưa đăng được bài: "+error.message);
 }finally{button.disabled=false;button.textContent="Đăng bài ↗"}
}
async function loadFeed(){
 const root=$("feedPosts");if(!root||feedLoading)return;
 if(!db||!user){root.innerHTML='<div class="feed-empty"><span>✦</span><strong>Bảng tin đang chờ bạn</strong><small>Đăng nhập để chia sẻ khoảnh khắc và xem bài viết của cộng đồng.</small><button class="primary small" id="feedLogin" type="button">Đăng nhập</button></div>';$("feedLogin")?.addEventListener("click",()=>openAuth(true));return}
 feedLoading=true;root.innerHTML='<p class="notice">Đang tải bảng tin...</p>';
 try{
  const {data:posts,error}=await db.from("posts").select("id,author_id,content,image_url,created_at").order("created_at",{ascending:false}).limit(50);
  if(error)throw error;
  if(!posts?.length){root.innerHTML='<div class="feed-empty"><span>✧</span><strong>Bảng tin còn trống</strong><small>Hãy là người đầu tiên chia sẻ điều thú vị hôm nay.</small></div>';return}
  const postIds=posts.map(p=>p.id);
  const [reactionsRes,commentsRes]=await Promise.all([
   db.from("post_reactions").select("post_id,user_id,reaction").in("post_id",postIds),
   db.from("post_comments").select("id,post_id,author_id,content,created_at").in("post_id",postIds).order("created_at",{ascending:true})
  ]);
  if(reactionsRes.error)throw reactionsRes.error;if(commentsRes.error)throw commentsRes.error;
  const comments=commentsRes.data||[],ids=[...new Set([...posts.map(p=>p.author_id),...comments.map(c=>c.author_id)])];
  const {data:profileRows,error:profilesError}=await db.from("profiles").select("id,display_name,avatar_url").in("id",ids);
  if(profilesError)throw profilesError;
  const profiles=new Map((profileRows||[]).map(p=>[p.id,p])),reactions=reactionsRes.data||[];
  window.__lumioProfileNames=new Map((profileRows||[]).map(p=>[p.id,p.display_name||"Lumio Member"]));
  root.innerHTML="";
  posts.forEach(post=>renderPostCard(post,profiles.get(post.author_id)||{},reactions.filter(x=>x.post_id===post.id),comments.filter(x=>x.post_id===post.id),root));
 }catch(error){root.innerHTML='<p class="notice">Chưa tải được bảng tin: '+escapeText(error.message)+'</p>'}
 finally{feedLoading=false}
}
function renderPostCard(post,author,reactions,comments,root){
 const card=document.createElement("article");card.className="feed-post";card.dataset.postId=post.id;
 const head=document.createElement("div");head.className="feed-post-head";
 const avatar=document.createElement("div");avatar.className="avatar feed-avatar";paintAvatar(avatar,author.avatar_url,author.display_name||"L");
 const identity=document.createElement("div");identity.className="feed-identity";
 const name=document.createElement("strong");name.textContent=author.display_name||"Lumio Member";
 const time=document.createElement("small");time.textContent=formatPostTime(post.created_at);
 identity.append(name,time);head.append(avatar,identity);
 if(post.author_id===user?.id){const del=document.createElement("button");del.className="post-delete";del.type="button";del.textContent="•••";del.setAttribute("aria-label","Tùy chọn bài viết");del.onclick=()=>{if(confirm("Bạn muốn xóa bài viết này?"))deletePost(post.id,post.image_url)};head.append(del)}
 card.append(head);
 if(post.content){const body=document.createElement("p");body.className="feed-post-content";body.textContent=post.content;card.append(body)}
 if(post.image_url){const image=document.createElement("img");image.className="feed-post-image";image.src=post.image_url;image.alt="Ảnh trong bài viết";image.loading="lazy";card.append(image)}
 const mine=reactions.some(x=>x.user_id===user?.id),stats=document.createElement("div");stats.className="feed-post-stats";stats.textContent=reactions.length+" lượt cảm xúc · "+comments.length+" bình luận";card.append(stats);
 const actions=document.createElement("div");actions.className="feed-post-actions";
 const like=document.createElement("button");like.type="button";like.className="feed-action"+(mine?" liked":"");like.textContent=(mine?"♥ Đã thích":"♡ Thích")+" · "+reactions.length;like.onclick=()=>togglePostReaction(post.id,mine);
 const commentToggle=document.createElement("button");commentToggle.type="button";commentToggle.className="feed-action";commentToggle.textContent="▢ Bình luận · "+comments.length;
 actions.append(like,commentToggle);card.append(actions);
 const commentsBox=document.createElement("div");commentsBox.className="post-comments hidden";
 comments.forEach(comment=>{const row=document.createElement("div");row.className="post-comment";const who=document.createElement("strong");who.textContent=profilesNameForComment(comment.author_id);const msg=document.createElement("span");msg.textContent=comment.content;row.append(who,msg);commentsBox.append(row)});
 const form=document.createElement("form");form.className="post-comment-form";const input=document.createElement("input");input.maxLength=1000;input.placeholder="Viết bình luận...";input.required=true;const send=document.createElement("button");send.type="submit";send.className="primary small";send.textContent="Gửi";form.append(input,send);form.onsubmit=async e=>{e.preventDefault();await addPostComment(post.id,input.value.trim(),send)};commentsBox.append(form);
 commentToggle.onclick=()=>{commentsBox.classList.toggle("hidden");if(!commentsBox.classList.contains("hidden"))input.focus()};
 card.append(commentsBox);root.append(card);
}
function profilesNameForComment(id){return window.__lumioProfileNames?.get(id)||"Thành viên"}
function formatPostTime(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";return new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date)}
async function togglePostReaction(postId,alreadyLiked){
 if(!db||!user)return;
 const query=db.from("post_reactions");
 const result=alreadyLiked?await query.delete().eq("post_id",postId).eq("user_id",user.id):await query.insert({post_id:postId,user_id:user.id,reaction:"like"});
 if(result.error){toast("Chưa cập nhật được cảm xúc: "+result.error.message);return}await loadFeed();
}
async function addPostComment(postId,content,button){
 if(!content||!db||!user)return;button.disabled=true;
 const {error}=await db.from("post_comments").insert({post_id:postId,author_id:user.id,content});
 button.disabled=false;if(error){toast("Chưa gửi được bình luận: "+error.message);return}toast("Đã gửi bình luận");await loadFeed();
}
async function deletePost(postId,imageUrl){
 if(!db||!user)return;
 const {error}=await db.from("posts").delete().eq("id",postId).eq("author_id",user.id);
 if(error){toast("Chưa xóa được bài viết: "+error.message);return}
 if(imageUrl){try{const url=new URL(imageUrl),marker="/storage/v1/object/public/lumio-posts/";const index=url.pathname.indexOf(marker);if(index>=0){const path=decodeURIComponent(url.pathname.slice(index+marker.length));await db.storage.from("lumio-posts").remove([path])}}catch(e){console.warn("Post image cleanup failed",e)}}
 toast("Đã xóa bài viết");await loadFeed();
}
function setupFeedRealtime(){
 if(!db||!user)return;
 if(feedChannel)db.removeChannel(feedChannel);
 feedChannel=db.channel("lumio-social-feed").on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>loadFeed()).on("postgres_changes",{event:"*",schema:"public",table:"post_comments"},()=>loadFeed()).on("postgres_changes",{event:"*",schema:"public",table:"post_reactions"},()=>loadFeed()).subscribe();
}

async function submitBetaFeedback(event){
 event.preventDefault();
 if(!db){$("feedbackStatus").textContent="Chưa kết nối được máy chủ. Vui lòng thử lại sau.";return}
 const rating=Number(document.querySelector('input[name="feedbackRating"]:checked')?.value);
 const message=$("feedbackMessage").value.trim();
 if(!rating||message.length<8){$("feedbackStatus").textContent="Vui lòng chọn đánh giá và nhập góp ý ít nhất 8 ký tự.";return}
 const button=$("submitFeedback");button.disabled=true;button.textContent="Đang gửi...";
 const ua=navigator.userAgent||"";
 const detected=$("feedbackDevice").value;
 const device=detected;
 const {error}=await db.from("beta_feedback").insert({
  user_id:user?.id||null,category:$("feedbackCategory").value,rating,message,
  device,contact:$("feedbackContact").value.trim()||null,app_version:"public-beta"
 });
 button.disabled=false;button.textContent="Gửi góp ý ↗";
 if(error){$("feedbackStatus").textContent="Chưa gửi được góp ý. Vui lòng thử lại.";console.warn("LUMIO feedback submission failed:",error.message);return}
 $("betaFeedbackForm").reset();$("feedbackStatus").textContent="Cảm ơn bạn! Góp ý đã được gửi đến nhóm LUMIO ✦";
}
function switchTab(tab){
 document.querySelectorAll(".tab[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 document.querySelectorAll(".more-nav-item").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
 $("view-rooms")?.classList.remove("room-chat-active");$("app")?.classList.remove("room-focus-active");
 const view=$("view-"+tab);if(view)view.classList.remove("hidden");
 const menu=$("moreNavMenu"),more=$("moreNavButton");
 if(menu)menu.classList.add("hidden");
 if(more){more.classList.remove("active");more.setAttribute("aria-expanded","false")}
 if(tab==="feed")loadFeed();
 if(tab==="notifications")loadNotifications();
 if(tab==="rooms")loadRooms();if(tab==="profile")loadBlockedUsers();
}
function toggleMoreNav(force){
 const menu=$("moreNavMenu"),button=$("moreNavButton");if(!menu||!button)return;
 const open=typeof force==="boolean"?force:menu.classList.contains("hidden");
 menu.classList.toggle("hidden",!open);button.classList.toggle("active",open);button.setAttribute("aria-expanded",String(open));
}
document.querySelectorAll(".tab[data-tab],.more-nav-item").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
$("moreNavButton").onclick=()=>toggleMoreNav();
document.addEventListener("click",e=>{if(!$("moreNavMenu")?.contains(e.target)&&!$("moreNavButton")?.contains(e.target))toggleMoreNav(false)});
$("betaFeedbackForm").onsubmit=submitBetaFeedback;$("reportForm").onsubmit=submitUserReport;$("closeReportModal").onclick=closeReportModal;$("cancelReport").onclick=closeReportModal;$("blockedUsersRefresh").onclick=loadBlockedUsers;
$("refreshFeed").onclick=()=>loadFeed();$("markAllNotificationsRead").onclick=markAllNotificationsRead;$("postComposer").onsubmit=publishPost;$("postImage").onchange=e=>setPostImagePreview(e.target.files?.[0]||null);
$("refreshPeople").onclick=()=>renderPeople();
$("openMessages").onclick=()=>{switchTab("messages");loadMatches()};
$("refreshRooms").onclick=loadRooms;
$("leaveRoomChat").onclick=async()=>{if(roomChannel){await db.removeChannel(roomChannel);roomChannel=null}activeRoom=null;$("view-rooms").classList.remove("room-chat-active");$("app").classList.remove("room-focus-active");loadRooms()};
$("roomChatForm").onsubmit=sendRoomMessage;

$("closeChat").onclick=()=>{if(typingTimer)clearTimeout(typingTimer);if(remoteTypingTimer)clearTimeout(remoteTypingTimer);typingIsOn=false;$("chatTypingIndicator").classList.add("hidden");if(messageChannel){db.removeChannel(messageChannel);messageChannel=null}$("chatPanel").classList.add("hidden");$("messagesList").classList.remove("hidden");activeChat=null;if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}if(messageChannel){db.removeChannel(messageChannel);messageChannel=null}};
$("chatInput").addEventListener("input",()=>{
 if(!activeChat||!messageChannel)return;
 if($("chatInput").value.trim()&&!typingIsOn){typingIsOn=true;messageChannel.send({type:"broadcast",event:"typing",payload:{sender_id:user.id,typing:true}})}
 if(typingTimer)clearTimeout(typingTimer);
 typingTimer=setTimeout(()=>{
  if(messageChannel&&typingIsOn)messageChannel.send({type:"broadcast",event:"typing",payload:{sender_id:user.id,typing:false}});
  typingIsOn=false;
 },1400);
});
$("chatForm").onsubmit=sendChatMessage;
$("startButton").onclick=()=>openAuth(false);
$("demoButton").onclick=()=>{demo=true;user=null;showApp();toast("Bạn đang trải nghiệm chế độ demo")};
$("authButton").onclick=()=>user?switchTab("profile"):openAuth(true);
$("closeModal").onclick=closeAuth;
$("switchAuth").onclick=()=>openAuth(!isLogin);
$("resendConfirmation").onclick=async()=>{const email=$("email").value.trim();if(!email){$("authMessage").textContent="Hãy nhập email trước.";return}const {error}=await db.auth.resend({type:"signup",email,options:{emailRedirectTo:new URL("./",window.location.href).href}});$("authMessage").textContent=error?error.message:"Đã gửi lại email xác nhận. Hãy kiểm tra Gmail.";};

$("authForm").onsubmit=async e=>{e.preventDefault();const email=$("email").value.trim(),password=$("password").value; if(!db){$("authMessage").textContent="Chưa kết nối Supabase. Hãy dùng bản demo hoặc cấu hình backend theo README.";return} $("authSubmit").disabled=true;try{const res=isLogin?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:new URL("./",window.location.href).href}});if(res.error)throw res.error;if(!isLogin&&!res.data.session){$("authMessage").textContent="Đã gửi email xác nhận. Hãy mở Gmail để xác nhận."; $("resendConfirmation").classList.remove("hidden"); return}user=res.data.user;demo=false;closeAuth();showApp();toast("Đăng nhập thành công")}catch(err){$("authMessage").textContent=err.message||"Có lỗi xảy ra"}finally{$("authSubmit").disabled=false}};
$("profileForm").onsubmit=async e=>{e.preventDefault();const p={...(profile||{}),name:$("displayName").value.trim(),bio:$("bio").value.trim(),country:$("country").value.trim(),interests:$("interests").value.trim()};localStorage.setItem("lumio_profile",JSON.stringify(p));profile=p;if(db&&user){const {error}=await db.from("profiles").upsert({id:user.id,display_name:p.name,bio:p.bio,country:p.country,interests:p.interests,avatar_url:p.avatar_url||null,updated_at:new Date().toISOString()});if(error){toast("Đã lưu trên thiết bị; đồng bộ lỗi: "+error.message);return}}loadProfile();toast("Đã lưu hồ sơ")}
$("avatarFile").onchange=e=>{const file=e.target.files?.[0];if(file)uploadAvatar(file)};
$("logoutButton").onclick=async()=>{await saveLastSeen();if(presenceChannel){await presenceChannel.untrack();db.removeChannel(presenceChannel);presenceChannel=null}if(presenceHeartbeat){clearInterval(presenceHeartbeat);presenceHeartbeat=null}onlineUserIds.clear();if(inboxChannel){db.removeChannel(inboxChannel);inboxChannel=null}if(profileChannel){db.removeChannel(profileChannel);profileChannel=null}if(feedChannel){db.removeChannel(feedChannel);feedChannel=null}if(notificationChannel){db.removeChannel(notificationChannel);notificationChannel=null}if(db&&user)await db.auth.signOut();user=null;demo=false;showWelcome();toast("Bạn đã đăng xuất")};
$("peopleSearch")?.addEventListener("input",e=>{peopleSearch=e.target.value;updatePeopleFilterUI();renderFilteredPeople()});
$("clearPeopleSearch")?.addEventListener("click",()=>{$("peopleSearch").value="";peopleSearch="";updatePeopleFilterUI();renderFilteredPeople();$("peopleSearch").focus()});
document.querySelectorAll("#peopleFilters .chip").forEach(button=>button.addEventListener("click",()=>{peopleFilter=button.dataset.peopleFilter;updatePeopleFilterUI();renderFilteredPeople()}));
document.querySelectorAll(".mood").forEach(b=>b.onclick=async()=>{document.querySelectorAll(".mood").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");currentMood=b.dataset.mood;$("moodResult").textContent="Tâm trạng của bạn: "+currentMood+". Hãy khám phá những người cùng tần số!";if(user&&db){const {error}=await db.from("profiles").upsert({id:user.id,display_name:profile?.name||"Lumio Member",mood:currentMood});if(error)toast("Chưa đồng bộ được tâm trạng");else{profile={...(profile||{}),mood:currentMood};renderFilteredPeople()}}else{toast("Đã chọn mood: "+currentMood);renderFilteredPeople()}});
$("nextQuestion").onclick=()=>{$("question").textContent=questions[++qIndex%questions.length]};
if(db){db.auth.getSession().then(({data})=>{if(data.session){user=data.session.user;showApp()}});db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)showApp()})}
document.addEventListener("visibilitychange",async()=>{if(!user||!presenceChannel)return;if(document.hidden){await saveLastSeen();await presenceChannel.untrack()}else{await trackMyPresence();if(activeChat)loadChatMessages()}});
window.addEventListener("focus",()=>{if(activeChat)loadChatMessages()});
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js?v=rooms-2",{updateViaCache:"none"}).then(reg=>reg.update()).catch(error=>console.warn("Service worker update failed",error));
})();