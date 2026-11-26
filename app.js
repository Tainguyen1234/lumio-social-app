(() => {
const $ = id => document.getElementById(id);
const cfg = window.LUMIO_CONFIG || {};
const hasBackend = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const db = hasBackend ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let user = null, isLogin = false, demo = false, currentMood = "", profile = null, activeChat = null, messageChannel = null;
const demoPeople = [
 {id:"demo-1",name:"Mia",age:20,country:"Việt Nam",mood:"Vui vẻ",bio:"Âm nhạc, du lịch và những cuộc trò chuyện thú vị.",initial:"M",color:"pink"},
 {id:"demo-2",name:"Alex",age:23,country:"Singapore",mood:"Khám phá",bio:"Thích game indie, cà phê và khám phá văn hóa.",initial:"A",color:"blue"},
 {id:"demo-3",name:"Yuna",age:21,country:"Nhật Bản",mood:"Chill",bio:"Một chút âm nhạc, một chút nghệ thuật.",initial:"Y",color:"gold"}
];
const questions = ["Nếu có thể đi bất cứ đâu cuối tuần này, bạn sẽ chọn nơi nào?","Bài hát nào luôn khiến tâm trạng bạn tốt hơn?","Bạn thích một buổi tối chơi game hay trò chuyện thật lâu?","Nếu có một siêu năng lực trong 24 giờ, bạn chọn gì?","Điều nhỏ bé nào khiến bạn vui hôm nay?"];
let qIndex=0;
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2600)}
function showApp(){ $("welcome").classList.add("hidden");$("app").classList.remove("hidden");$("authButton").textContent=user?"Tài khoản":"Đăng nhập";loadProfile();renderPeople();loadMatches();}
function showWelcome(){ $("app").classList.add("hidden");$("welcome").classList.remove("hidden");}
function openAuth(login=false){isLogin=login;$("authTitle").textContent=login?"Đăng nhập LUMIO":"Tạo tài khoản LUMIO";$("authHint").textContent=login?"Chào mừng bạn quay trở lại.":"Đăng ký để tạo hồ sơ và bắt đầu kết nối."; $("authSubmit").textContent=login?"Đăng nhập":"Tạo tài khoản";$("switchAuth").textContent=login?"Chưa có tài khoản? Đăng ký":"Đã có tài khoản? Đăng nhập";$("authMessage").textContent="";$("authModal").classList.remove("hidden")}
function closeAuth(){$("authModal").classList.add("hidden")}
function escapeText(s){return String(s??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[c]))}
function loadProfile(){let p=JSON.parse(localStorage.getItem("lumio_profile")||"{}");profile=p;$("displayName").value=p.name||user?.email?.split("@")[0]||"Lumio Member";$("bio").value=p.bio||"";$("country").value=p.country||"Việt Nam";$("interests").value=p.interests||"";$("greeting").textContent="Xin chào, "+(p.name||"bạn")+" ✨";$("myAvatar").textContent=(p.name||"L").slice(0,1).toUpperCase()}
async function renderPeople(){
 const list=$("people"); list.innerHTML="";
 if(!db || !user){
  demoPeople.forEach(p=>renderPersonCard(p,list,true));
  return;
 }
 list.innerHTML='<p class="notice">Đang tìm những người dùng LUMIO...</p>';
 const {data,error}=await db.from("profiles").select("id,display_name,bio,country,interests,mood,created_at").neq("id",user.id).order("created_at",{ascending:false}).limit(60);
 if(error){list.innerHTML="";toast("Không tải được danh sách: "+error.message);return}
 const people=(data||[]).sort(()=>Math.random()-.5);
 list.innerHTML="";
 if(!people.length){list.innerHTML='<p class="notice">Chưa có hồ sơ thành viên khác. Hãy mời bạn bè tham gia LUMIO nhé!</p>';return}
 people.forEach(p=>renderPersonCard({id:p.id,name:p.display_name||"Lumio Member",country:p.country||"Chưa cập nhật quốc gia",mood:p.mood||"Chưa cập nhật tâm trạng",bio:p.bio||p.interests||"Đang khám phá LUMIO",initial:(p.display_name||"L").slice(0,1).toUpperCase()},list,false));
}
function renderPersonCard(p,list,isDemo){
 const el=document.createElement("article");el.className="person";
 const top=document.createElement("div");top.className="person-top";
 const avatar=document.createElement("div");avatar.className="person-avatar";avatar.textContent=p.initial||"L";
 const info=document.createElement("div");const name=document.createElement("h4");name.textContent=p.name;const meta=document.createElement("small");meta.textContent=p.country+" · "+p.mood;info.append(name,meta);top.append(avatar,info);
 const bio=document.createElement("p");bio.textContent=p.bio;
 const actions=document.createElement("div");actions.className="person-actions";
 const pass=document.createElement("button");pass.className="pass";pass.textContent="Bỏ qua";pass.onclick=()=>el.remove();
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
 actions.append(pass,like);el.append(top,bio,actions);list.appendChild(el);
}

async function loadMatches(){
 const root=$("messagesList"); if(!root)return;
 if(!db||!user){root.textContent="Đăng nhập để xem các kết nối thật.";return}
 root.textContent="Đang tải kết nối...";
 const {data:matches,error}=await db.from("matches").select("user1,user2,created_at").or("user1.eq."+user.id+",user2.eq."+user.id).order("created_at",{ascending:false});
 if(error){root.textContent="Chưa tải được kết nối. Hãy chạy bản cập nhật SQL trong Supabase. Chi tiết: "+error.message;return}
 if(!matches?.length){root.textContent="Chưa có tương hợp hai chiều. Khi bạn và một thành viên cùng thích nhau, cuộc trò chuyện sẽ xuất hiện ở đây.";return}
 const ids=matches.map(m=>m.user1===user.id?m.user2:m.user1);
 const {data:profiles,error:profileError}=await db.from("profiles").select("id,display_name,country").in("id",ids);
 if(profileError){root.textContent="Không tải được hồ sơ kết nối: "+profileError.message;return}
 root.innerHTML="";
 matches.forEach(m=>{
  const other=m.user1===user.id?m.user2:m.user1, p=(profiles||[]).find(x=>x.id===other)||{};
  const b=document.createElement("button");b.className="match-row";b.type="button";
  const av=document.createElement("span");av.className="match-avatar";av.textContent=(p.display_name||"L").slice(0,1).toUpperCase();
  const label=document.createElement("span");label.className="match-label";const strong=document.createElement("b");strong.textContent=p.display_name||"Lumio Member";const small=document.createElement("small");small.textContent=p.country||"Thành viên LUMIO";label.append(strong,small);
  const arrow=document.createElement("span");arrow.textContent="›";b.append(av,label,arrow);b.onclick=()=>openChat(other,p.display_name||"Lumio Member");root.append(b);
 });
}
async function openChat(otherId,name){
 if(!db||!user)return;
 activeChat={id:otherId,name};$("chatPanel").classList.remove("hidden");$("chatTitle").textContent=name;$("chatMessages").textContent="Đang tải tin nhắn...";
 await loadChatMessages();
 if(messageChannel)db.removeChannel(messageChannel);
 messageChannel=db.channel("lumio-chat-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
  const m=payload.new;if((m.sender_id===user.id&&m.receiver_id===otherId)||(m.sender_id===otherId&&m.receiver_id===user.id))loadChatMessages();
 }).subscribe();
}
async function loadChatMessages(){
 if(!activeChat||!db||!user)return;
 const other=activeChat.id;
 const filter="and(sender_id.eq."+user.id+",receiver_id.eq."+other+"),and(sender_id.eq."+other+",receiver_id.eq."+user.id+")";
 const {data,error}=await db.from("messages").select("id,sender_id,receiver_id,body,created_at").or(filter).order("created_at",{ascending:true}).limit(200);
 const root=$("chatMessages");if(error){root.textContent="Không tải được tin nhắn: "+error.message;return}
 root.innerHTML="";
 if(!data?.length){root.textContent="Hai bạn đã tương hợp! Hãy gửi lời chào đầu tiên.";return}
 data.forEach(m=>{const bubble=document.createElement("div");bubble.className="chat-bubble "+(m.sender_id===user.id?"mine":"theirs");bubble.textContent=m.body;root.append(bubble)});
 root.scrollTop=root.scrollHeight;
}
async function sendChatMessage(e){
 e.preventDefault();if(!activeChat||!db||!user)return;
 const input=$("chatInput"),body=input.value.trim();if(!body)return;
 $("sendChat").disabled=true;
 const {error}=await db.from("messages").insert({sender_id:user.id,receiver_id:activeChat.id,body});
 $("sendChat").disabled=false;
 if(error){toast("Chưa gửi được tin nhắn: "+error.message);return}
 input.value="";await loadChatMessages();
}

function switchTab(tab){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));$("view-"+tab).classList.remove("hidden")}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
$("refreshPeople").onclick=()=>renderPeople();
$("openMessages").onclick=()=>{switchTab("messages");loadMatches()};
$("closeChat").onclick=()=>{$("chatPanel").classList.add("hidden");activeChat=null;if(messageChannel){db.removeChannel(messageChannel);messageChannel=null}};
$("chatForm").onsubmit=sendChatMessage;
$("startButton").onclick=()=>openAuth(false);
$("demoButton").onclick=()=>{demo=true;user=null;showApp();toast("Bạn đang trải nghiệm chế độ demo")};
$("authButton").onclick=()=>user?switchTab("profile"):openAuth(true);
$("closeModal").onclick=closeAuth;
$("switchAuth").onclick=()=>openAuth(!isLogin);
$("resendConfirmation").onclick=async()=>{const email=$("email").value.trim();if(!email){$("authMessage").textContent="Hãy nhập email trước.";return}const {error}=await db.auth.resend({type:"signup",email,options:{emailRedirectTo:new URL("./",window.location.href).href}});$("authMessage").textContent=error?error.message:"Đã gửi lại email xác nhận. Hãy kiểm tra Gmail.";};

$("authForm").onsubmit=async e=>{e.preventDefault();const email=$("email").value.trim(),password=$("password").value; if(!db){$("authMessage").textContent="Chưa kết nối Supabase. Hãy dùng bản demo hoặc cấu hình backend theo README.";return} $("authSubmit").disabled=true;try{const res=isLogin?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:new URL("./",window.location.href).href}});if(res.error)throw res.error;if(!isLogin&&!res.data.session){$("authMessage").textContent="Đã gửi email xác nhận. Hãy mở Gmail để xác nhận."; $("resendConfirmation").classList.remove("hidden"); return}user=res.data.user;demo=false;closeAuth();showApp();toast("Đăng nhập thành công")}catch(err){$("authMessage").textContent=err.message||"Có lỗi xảy ra"}finally{$("authSubmit").disabled=false}};
$("profileForm").onsubmit=async e=>{e.preventDefault();const p={name:$("displayName").value.trim(),bio:$("bio").value.trim(),country:$("country").value.trim(),interests:$("interests").value.trim()};localStorage.setItem("lumio_profile",JSON.stringify(p));profile=p;if(db&&user){const {error}=await db.from("profiles").upsert({id:user.id,display_name:p.name,bio:p.bio,country:p.country,interests:p.interests,updated_at:new Date().toISOString()});if(error){toast("Đã lưu trên thiết bị; đồng bộ lỗi: "+error.message);return}}loadProfile();toast("Đã lưu hồ sơ")}
$("logoutButton").onclick=async()=>{if(db&&user)await db.auth.signOut();user=null;demo=false;showWelcome();toast("Bạn đã đăng xuất")};
document.querySelectorAll(".mood").forEach(b=>b.onclick=async()=>{document.querySelectorAll(".mood").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");currentMood=b.dataset.mood;$("moodResult").textContent="Tâm trạng của bạn: "+currentMood+". Hãy khám phá những người cùng tần số!";if(user&&db){const {error}=await db.from("profiles").upsert({id:user.id,display_name:profile?.name||"Lumio Member",mood:currentMood});if(error)toast("Chưa đồng bộ được tâm trạng")}else toast("Đã chọn mood: "+currentMood)});
$("nextQuestion").onclick=()=>{$("question").textContent=questions[++qIndex%questions.length]};
if(db){db.auth.getSession().then(({data})=>{if(data.session){user=data.session.user;showApp()}});db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)showApp()})}
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();