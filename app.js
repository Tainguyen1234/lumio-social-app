(() => {
const $ = id => document.getElementById(id);
const cfg = window.LUMIO_CONFIG || {};
const hasBackend = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
const db = hasBackend ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let user = null, isLogin = false, demo = false, currentMood = "", profile = null;
const demoPeople = [
 {id:"demo-1",name:"Mia",age:20,country:"Việt Nam",mood:"Vui vẻ",bio:"Âm nhạc, du lịch và những cuộc trò chuyện thú vị.",initial:"M",color:"pink"},
 {id:"demo-2",name:"Alex",age:23,country:"Singapore",mood:"Khám phá",bio:"Thích game indie, cà phê và khám phá văn hóa.",initial:"A",color:"blue"},
 {id:"demo-3",name:"Yuna",age:21,country:"Nhật Bản",mood:"Chill",bio:"Một chút âm nhạc, một chút nghệ thuật.",initial:"Y",color:"gold"}
];
const questions = ["Nếu có thể đi bất cứ đâu cuối tuần này, bạn sẽ chọn nơi nào?","Bài hát nào luôn khiến tâm trạng bạn tốt hơn?","Bạn thích một buổi tối chơi game hay trò chuyện thật lâu?","Nếu có một siêu năng lực trong 24 giờ, bạn chọn gì?","Điều nhỏ bé nào khiến bạn vui hôm nay?"];
let qIndex=0;
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2600)}
function showApp(){ $("welcome").classList.add("hidden");$("app").classList.remove("hidden");$("authButton").textContent=user?"Tài khoản":"Đăng nhập";loadProfile();renderPeople();}
function showWelcome(){ $("app").classList.add("hidden");$("welcome").classList.remove("hidden");}
function openAuth(login=false){isLogin=login;$("authTitle").textContent=login?"Đăng nhập LUMIO":"Tạo tài khoản LUMIO";$("authHint").textContent=login?"Chào mừng bạn quay trở lại.":"Đăng ký để tạo hồ sơ và bắt đầu kết nối."; $("authSubmit").textContent=login?"Đăng nhập":"Tạo tài khoản";$("switchAuth").textContent=login?"Chưa có tài khoản? Đăng ký":"Đã có tài khoản? Đăng nhập";$("authMessage").textContent="";$("authModal").classList.remove("hidden")}
function closeAuth(){$("authModal").classList.add("hidden")}
function loadProfile(){let p=JSON.parse(localStorage.getItem("lumio_profile")||"{}");profile=p;$("displayName").value=p.name||user?.email?.split("@")[0]||"Lumio Member";$("bio").value=p.bio||"";$("country").value=p.country||"Việt Nam";$("interests").value=p.interests||"";$("greeting").textContent="Xin chào, "+(p.name||"bạn")+" ✨";$("myAvatar").textContent=(p.name||"L").slice(0,1).toUpperCase()}
function renderPeople(){const list=$("people");list.innerHTML="";demoPeople.forEach(p=>{const el=document.createElement("article");el.className="person";el.innerHTML=`<div class="person-top"><div class="person-avatar">${p.initial}</div><div><h4>${p.name}, ${p.age}</h4><small>${p.country} · ${p.mood}</small></div></div><p>${p.bio}</p><div class="person-actions"><button class="pass">Bỏ qua</button><button class="like">♥ Kết nối</button></div>`;el.querySelector(".pass").onclick=()=>{el.remove();toast("Đã ẩn gợi ý này")};el.querySelector(".like").onclick=()=>{if(!user&&!demo){openAuth();toast("Đăng nhập để lưu kết nối");return}toast("Đã gửi lời mời kết nối!");el.querySelector(".like").textContent="✓ Đã gửi";el.querySelector(".like").disabled=true};list.appendChild(el)})}
function switchTab(tab){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));$("view-"+tab).classList.remove("hidden")}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
$("startButton").onclick=()=>openAuth(false);
$("demoButton").onclick=()=>{demo=true;user=null;showApp();toast("Bạn đang trải nghiệm chế độ demo")};
$("authButton").onclick=()=>user?switchTab("profile"):openAuth(true);
$("closeModal").onclick=closeAuth;
$("switchAuth").onclick=()=>openAuth(!isLogin);
$("authForm").onsubmit=async e=>{e.preventDefault();const email=$("email").value.trim(),password=$("password").value; if(!db){$("authMessage").textContent="Chưa kết nối Supabase. Hãy dùng bản demo hoặc cấu hình backend theo README.";return} $("authSubmit").disabled=true;try{const res=isLogin?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:new URL("./",window.location.href).href}});if(res.error)throw res.error;if(!isLogin&&!res.data.session){$("authMessage").textContent="Đã gửi email xác nhận. Hãy xác nhận email rồi đăng nhập.";return}user=res.data.user;demo=false;closeAuth();showApp();toast("Đăng nhập thành công")}catch(err){$("authMessage").textContent=err.message||"Có lỗi xảy ra"}finally{$("authSubmit").disabled=false}};
$("profileForm").onsubmit=async e=>{e.preventDefault();const p={name:$("displayName").value.trim(),bio:$("bio").value.trim(),country:$("country").value.trim(),interests:$("interests").value.trim()};localStorage.setItem("lumio_profile",JSON.stringify(p));profile=p;if(db&&user){const {error}=await db.from("profiles").upsert({id:user.id,display_name:p.name,bio:p.bio,country:p.country,interests:p.interests,updated_at:new Date().toISOString()});if(error){toast("Đã lưu trên thiết bị; đồng bộ lỗi: "+error.message);return}}loadProfile();toast("Đã lưu hồ sơ")}
$("logoutButton").onclick=async()=>{if(db&&user)await db.auth.signOut();user=null;demo=false;showWelcome();toast("Bạn đã đăng xuất")};
document.querySelectorAll(".mood").forEach(b=>b.onclick=async()=>{document.querySelectorAll(".mood").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");currentMood=b.dataset.mood;$("moodResult").textContent="Tâm trạng của bạn: "+currentMood+". Hãy khám phá những người cùng tần số!";if(user&&db){const {error}=await db.from("profiles").upsert({id:user.id,display_name:profile?.name||"Lumio Member",mood:currentMood});if(error)toast("Chưa đồng bộ được tâm trạng")}else toast("Đã chọn mood: "+currentMood)});
$("nextQuestion").onclick=()=>{$("question").textContent=questions[++qIndex%questions.length]};
if(db){db.auth.getSession().then(({data})=>{if(data.session){user=data.session.user;showApp()}});db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)showApp()})}
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();