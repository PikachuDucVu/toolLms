# Thiết kế tự lưu và kế thừa mức độ nắm bài

## Mục tiêu

Tách hoàn toàn thao tác chọn mức độ nắm bài khỏi thao tác tạo nhận xét AI. Lựa chọn L1–L4 phải được lưu ngay cho buổi hiện tại và được dùng làm mức mặc định cho buổi học sau của cùng học sinh trong cùng lớp.

## Phạm vi

Áp dụng cho giao diện nhận xét của các buổi học thường. Không thay đổi luồng chấm checkpoint hoặc demo.

## Yêu cầu hành vi

1. Khi giáo viên chọn L1–L4:
   - Cập nhật lựa chọn trên giao diện ngay lập tức.
   - Tự động lưu đánh giá của học sinh cho buổi hiện tại.
   - Không gọi API tạo nhận xét AI.
2. AI chỉ tạo nhận xét khi giáo viên nhấn một trong hai nút:
   - `Tạo nhận xét` của một học sinh.
   - `Tạo AI cho x học sinh`.
3. Khi mở một buổi học thường:
   - Nếu học sinh đã có đánh giá trong chính buổi đó, dùng đánh giá của buổi đó.
   - Nếu chưa có, lấy mức độ nắm bài gần nhất của học sinh từ một buổi trước trong cùng lớp.
   - Nếu chưa có lịch sử, dùng mức mặc định L3.
4. Mức được kế thừa chỉ là giá trị khởi tạo cho buổi mới. Khi lưu ở buổi mới, hệ thống tạo hoặc cập nhật bản ghi của buổi mới và không sửa dữ liệu của buổi cũ.
5. Ghi chú bổ sung không tự lưu theo từng phím nhập. Giáo viên tiếp tục dùng nút `Lưu đánh giá`, hoặc ghi chú được lưu trước khi tạo/gửi nhận xét như luồng hiện tại.

## Kiến trúc và dữ liệu

### Backend

API tải đánh giá theo buổi sẽ trả về đánh giá hiệu lực cho từng học sinh:

- Bản ghi của `slot_id` hiện tại nếu tồn tại.
- Nếu không tồn tại, mức `learning_level` từ bản ghi gần nhất có cùng `class_id`, `student_id` và thuộc một buổi trước.
- Ghi chú kế thừa mặc định là rỗng để tránh mang một nhận xét tình huống của buổi cũ sang buổi mới.
- Response cần phân biệt dữ liệu đã lưu ở buổi hiện tại với dữ liệu được kế thừa, để frontend không hiển thị nhầm là đã lưu cho buổi hiện tại.

API `PUT` đánh giá hiện có tiếp tục được dùng để lưu lựa chọn cho buổi hiện tại. Khóa logic vẫn là giáo viên/lớp/buổi/học sinh theo schema hiện tại.

### Frontend

`onRegularLearningLevelChange` sẽ:

1. Chuẩn hóa và cập nhật `regularLearningLevelDrafts` ngay.
2. Đánh dấu học sinh đang có thay đổi.
3. Cập nhật selected state và trạng thái lưu trên giao diện.
4. Gọi một hàm tự lưu riêng cho mức học, dùng API lưu đánh giá hiện có.
5. Không gọi `generateSingle`, `autoCommentAll` hoặc `/api/generate_comment`.

Để tránh response cũ ghi đè lựa chọn mới khi người dùng đổi mức nhanh, mỗi học sinh có một phiên bản/request token tự lưu. Chỉ request mới nhất được phép cập nhật trạng thái `Đã lưu` hoặc lỗi trên UI.

## Trạng thái giao diện

- Ngay sau khi chọn: `Đang lưu...`.
- Thành công: `Đã lưu`.
- Thất bại: `Lưu thất bại` hoặc thông báo lỗi rõ ràng; lựa chọn vừa chọn vẫn được giữ trong draft.
- Khi thất bại, nút `Lưu đánh giá` vẫn cho phép thử lại.
- Trong lúc tự lưu mức của một học sinh, không khóa toàn bộ lớp và không chặn thao tác với học sinh khác.
- Nút tạo AI của đúng học sinh phải đợi lần tự lưu mới nhất hoàn tất hoặc chủ động lưu snapshot mới nhất trước khi tạo, bảo đảm prompt dùng đúng mức đang chọn.

## Luồng dữ liệu

### Chọn mức

`radio change` → cập nhật draft → hiển thị `Đang lưu...` → `PUT /api/assessments/:slotId/:studentId` → cập nhật server-synced state → hiển thị `Đã lưu`.

Không có bước gọi AI trong luồng này.

### Tạo nhận xét đơn

Nhấn `Tạo nhận xét` → chờ/tái xác nhận đánh giá mới nhất đã được lưu → chụp snapshot mức và ghi chú → gọi `/api/generate_comment` → lưu bản nháp AI vào `generatedComments`.

### Tạo nhận xét hàng loạt

Nhấn `Tạo AI cho x học sinh` → chụp snapshot từng học sinh có mặt → lưu các đánh giá còn thay đổi → gọi AI theo batch như hiện tại.

### Mở buổi mới

Tải assessments → backend trả bản ghi buổi hiện tại hoặc mức kế thừa gần nhất → frontend khởi tạo draft → lựa chọn hiển thị đúng mức gần nhất. Dữ liệu kế thừa chưa được coi là bản ghi đã lưu của buổi hiện tại cho đến khi người dùng chọn/lưu hoặc bắt đầu tạo nhận xét.

## Xử lý lỗi và cạnh tranh request

- Nếu tải lịch sử thất bại, giữ hành vi chặn tạo/gửi hiện tại và hiển thị nút thử lại.
- Nếu tự lưu thất bại, không hoàn tác lựa chọn trên giao diện.
- Nếu người dùng đổi L2 → L4 nhanh, response lưu L2 đến muộn không được đổi trạng thái hoặc draft khỏi L4.
- Khi tạo AI trong lúc request tự lưu đang chạy, thao tác tạo phải chờ request đó hoặc lưu lại snapshot L4 trước khi gọi AI.
- Khi đổi lớp hoặc đổi buổi, response của context cũ bị bỏ qua bằng kiểm tra `classId` và `slotId` hiện có.

## Kiểm thử chấp nhận

1. Chọn L1–L4 không tạo network request tới `/api/generate_comment`.
2. Chọn mức hiển thị ngay và được lưu qua API assessments.
3. Đổi sang học sinh khác rồi quay lại vẫn thấy đúng mức.
4. Tải lại trang và mở lại cùng buổi vẫn thấy mức đã lưu.
5. Mở buổi sau khi chưa có assessment riêng sẽ thấy mức gần nhất từ buổi trước.
6. Sửa mức ở buổi sau không thay đổi mức đã lưu của buổi trước.
7. Học sinh chưa có lịch sử dùng L3.
8. Ghi chú buổi trước không tự động xuất hiện ở buổi sau.
9. Đổi mức nhanh nhiều lần chỉ giữ và lưu lựa chọn cuối cùng.
10. Nhấn tạo AI ngay sau khi đổi mức khiến prompt sử dụng lựa chọn mới nhất.
11. Khi lưu thất bại, draft không mất và nút `Lưu đánh giá` có thể thử lại.
12. Tạo AI đơn và hàng loạt vẫn lưu đánh giá trước khi gọi AI như một lớp bảo vệ dữ liệu.

## Ngoài phạm vi

- Không thay đổi cấu trúc prompt AI ngoài việc bảo đảm nhận đúng mức mới nhất.
- Không kế thừa ghi chú bổ sung giữa các buổi.
- Không thêm bảng cấu hình mức mặc định toàn cục cho học sinh.
- Không thay đổi checkpoint, demo hoặc cách gửi nhận xét lên LMS.
