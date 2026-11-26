# LUMIO MVP 1.0 — hướng dẫn nhanh (tiếng Việt)

## Bản hiện tại làm được gì?
- Giao diện responsive cho điện thoại và máy tính, có thể cài như PWA.
- Có chế độ demo để xem giao diện, mood picker, câu hỏi Duo Quest, danh sách phòng mẫu.
- Có sẵn điểm tích hợp Supabase Auth và lưu hồ sơ.
- Có SQL khởi tạo bảng hồ sơ, lượt thích và tin nhắn với Row Level Security.

**Trạng thái cập nhật 26/11/2026:** Project Supabase `lumio-production` đã được kết nối trong `config.js`. Bảng hồ sơ, likes, matches và messages đã có; tự tạo hồ sơ khi đăng ký, ghép đôi hai chiều, giao diện chat riêng và realtime đã được nối. Chính sách RLS đã được siết để chỉ người đã match mới đọc/gửi tin nhắn. Demo vẫn chỉ là dữ liệu mẫu trên thiết bị. Voice Rooms, report/block, kiểm duyệt và xóa tài khoản vẫn chưa triển khai.

## A. Chạy thử trên Windows 11
1. Tải và giải nén `LUMIO_MVP_1_0.zip`.
2. Cài VS Code (hoặc dùng Notepad) và mở thư mục đã giải nén.
3. Cách dễ nhất: cài extension **Live Server** trong VS Code.
4. Mở `index.html`, nhấn chuột phải → **Open with Live Server**.
5. Trình duyệt mở trang LUMIO. Chọn **Dùng thử bản demo** để trải nghiệm.

Có thể chạy server tĩnh bằng Python nếu đã cài Python:
`python -m http.server 8000`
Sau đó mở `http://localhost:8000`.

## B. Cấu hình tài khoản thật bằng Supabase
1. Trên Windows, mở https://supabase.com và tạo tài khoản.
2. Tạo project mới tên `lumio-mvp`. Gói miễn phí có giới hạn sử dụng; không bật dịch vụ trả phí nếu chưa xem kỹ hạn mức.
3. Vào **SQL Editor → New query**, mở file `supabase_schema.sql`, sao chép toàn bộ và chạy.
4. Vào **Project Settings → API** (hoặc Connect), sao chép Project URL và anon/public key.
5. Mở `config.js`, điền:
   `SUPABASE_URL: "https://YOUR_PROJECT.supabase.co"`
   `SUPABASE_ANON_KEY: "YOUR_ANON_OR_PUBLISHABLE_KEY"`
6. Không đưa `service_role` key vào `config.js`, không gửi key bí mật cho người khác.
7. Chạy lại website qua Live Server. Đăng ký bằng email. Nếu bật email confirmation, xác nhận email trước khi đăng nhập.
8. Điền hồ sơ và lưu. Hồ sơ sẽ được ghi vào Supabase.

## C. Đưa lên mạng để mở trên iPhone và Android
Cần deploy thư mục này lên một dịch vụ hosting HTTPS (ví dụ Netlify hoặc Cloudflare Pages; kiểm tra hạn mức miễn phí hiện hành).
1. Tạo tài khoản hosting.
2. Deploy thư mục chứa `index.html`, `styles.css`, `app.js`, `config.js`, `manifest.webmanifest`, `icon.svg`, `sw.js`.
3. Lấy URL HTTPS được cấp.
4. Trên iPhone: mở URL bằng Safari → nút Share → **Add to Home Screen**.
5. Trên Android: mở URL bằng Chrome → menu → **Install app** hoặc **Add to Home screen**.

Lưu ý: Không thể cài PWA trực tiếp từ `file://`; phải dùng HTTPS hoặc localhost.

## D. Bước phát triển tiếp theo
- Kết nối danh sách hồ sơ thật từ bảng `profiles`.
- Thêm luồng gửi/nhận like và tạo match hai chiều.
- Xây dựng giao diện chat, giới hạn nhắn tin cho match hợp lệ, bật realtime.
- Xây dựng Vibe Rooms bằng dịch vụ voice/WebRTC.
- Bổ sung report/block, kiểm duyệt, giới hạn tuổi phù hợp, chống spam và quy trình xóa tài khoản.
- Kiểm thử bảo mật/RLS trước khi mở beta công khai.

## Bảo vệ người dùng
LUMIO hướng tới người trưởng thành ở bản MVP. Trước khi ra mắt công khai cần xác định chính sách độ tuổi, điều khoản, chính sách quyền riêng tư, báo cáo/chặn, xử lý nội dung và quy trình phản hồi sự cố. Không mở chat/voice công khai nếu chưa có kiểm duyệt và cơ chế an toàn phù hợp.


## E. Trạng thái ghép đôi hai chiều và chat riêng
Backend đã được áp dụng migration trực tiếp trên Supabase: trigger tạo match khi hai người cùng thích nhau; tin nhắn chỉ được đọc/gửi giữa hai tài khoản đã match; tin nhắn được bật Realtime. Khi có tương hợp, tab **Tin nhắn** sẽ liệt kê người đó để mở chat. Bản `app.js` mới cũng tự làm mới danh sách kết nối sau khi phát hiện tương hợp.

## F. Việc cần hoàn thành trước beta công khai
- Bật **Leaked Password Protection** trong Supabase Auth để chặn mật khẩu đã bị lộ.
- Thử đăng ký hai tài khoản riêng, xác nhận email, cập nhật hồ sơ, like chéo và gửi/nhận tin nhắn trên hai thiết bị/trình duyệt.
- Bổ sung report/block, kiểm duyệt, giới hạn tuổi, điều khoản, chính sách quyền riêng tư và quy trình xóa tài khoản.
- Triển khai HTTPS hosting và kiểm tra URL thực tế trên iPhone.
