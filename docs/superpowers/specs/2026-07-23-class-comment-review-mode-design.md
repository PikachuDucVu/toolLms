# Thiết kế chế độ review nhận xét cả lớp

## Bối cảnh

Ở chế độ buổi học thường, giao diện hiện tại hiển thị danh sách học sinh ở cột trái và chi tiết của một học sinh ở khu vực chính. Sau khi tạo nhận xét AI cho cả lớp, giáo viên phải chọn từng học sinh để đọc và chỉnh sửa, khiến việc rà soát 15–30 nhận xét chậm và khó phát hiện nội dung trùng lặp.

## Mục tiêu

Tạo một chế độ `Review cả lớp` trên desktop để giáo viên có thể đọc, so sánh và chỉnh sửa toàn bộ nhận xét trong một màn hình, đồng thời giữ nguyên đầy đủ chức năng hiện tại của từng học sinh.

## Quyết định thiết kế

- Thêm chế độ review riêng, không thay thế giao diện chi tiết hiện tại.
- Bảng chính tập trung vào các thông tin cần so sánh: học sinh, trạng thái điểm danh, mức L1–L4 và nhận xét.
- Mỗi hàng có nút `Chi tiết` mở panel bên phải.
- Panel chi tiết cung cấp toàn bộ thao tác hiện có của học sinh.
- Không thêm quy trình bắt buộc đánh dấu `Đã review`; giáo viên có thể xem, sửa và gửi trực tiếp.
- Bộ lọc chỉ ảnh hưởng nội dung đang hiển thị, không âm thầm thay đổi phạm vi gửi.

## Phạm vi chức năng

### Bảng review

- Hiển thị tất cả học sinh có bản nháp AI, kèm học sinh vắng hoặc chưa có bản nháp khi phù hợp.
- Cột chính:
  - Học sinh và trạng thái điểm danh.
  - Mức học L1–L4.
  - Nhận xét gửi phụ huynh, chỉnh sửa trực tiếp.
  - Thao tác mở chi tiết và tạo lại.
- Textarea nhận xét tự giãn theo nội dung, có đếm ký tự và trạng thái lưu bản nháp.
- Tìm kiếm theo tên học sinh hoặc nội dung nhận xét.
- Bộ lọc:
  - Tất cả.
  - Cần chú ý.
  - Có nội dung trùng.
  - Chưa có bản nháp.
  - Theo L1/L2/L3/L4.
- Sắp xếp tùy chọn theo tên, mức học, trạng thái điểm danh hoặc cảnh báo.
- Cảnh báo trùng nội dung hoặc nhận xét bất thường bằng màu vàng; cảnh báo không chặn gửi.
- Header cột và thanh thao tác được sticky khi cuộn.

### Panel chi tiết

Panel bên phải mở từ một hàng và dùng chung state với bảng. Panel phải giữ các chức năng:

- Chọn mức L1–L4 và autosave như luồng hiện tại.
- Ghi chú bổ sung và mẫu ghi chú nhanh.
- Xem nhận xét buổi trước.
- Hiển thị nhận xét hiện tại trên LMS nếu có.
- Tạo hoặc tạo lại nhận xét AI cho một học sinh.
- Chỉnh sửa nhận xét đầy đủ.
- Gửi riêng lên LMS.
- Copy nhận xét cho Zalo.
- Xóa bản nháp AI.
- Đóng panel hoặc chuyển học sinh trước/sau mà không mất vị trí bảng.

### Thao tác hàng loạt

- `Review x nhận xét` chỉ hiển thị khi có bản nháp phù hợp.
- Thanh thao tác cố định cung cấp:
  - Tạo AI cho cả lớp.
  - Gửi tất cả nhận xét đã có bản nháp.
  - Sao chép Zalo cả lớp.
  - Tạo lại các mục đang lọc nếu có lựa chọn rõ ràng.
- Khi bộ lọc đang bật, nút gửi chính vẫn ghi rõ tổng phạm vi, ví dụ `Gửi tất cả 18 nhận xét`.
- Có nút phụ riêng `Chỉ gửi 5 mục đang lọc`, kèm xác nhận trước khi gửi.
- Lỗi tạo/gửi được hiển thị trên đúng hàng; các hàng khác vẫn giữ bản nháp và tiếp tục xử lý.

## Luồng state và dữ liệu

- Thêm một cờ chế độ review và học sinh đang mở panel; không tạo kho dữ liệu nhận xét thứ hai.
- Bảng và panel cùng đọc/ghi các state hiện có:
  - `generatedComments`.
  - `manualComments`.
  - `regularLearningLevelDrafts`.
  - `regularNoteDrafts`.
  - Trạng thái assessments và autosave.
- Chỉnh sửa inline gọi cùng handler cập nhật nhận xét hiện tại.
- Tạo lại, gửi, copy, xóa và autosave gọi lại các service/handler hiện có để tránh hai luồng hành vi khác nhau.
- Khi chuyển chế độ:
  - Giữ draft, bộ lọc, hàng đang chọn và vị trí cuộn.
  - Không gọi lại AI chỉ vì render bảng hoặc mở panel.
- Khi render lại sau một request:
  - Khôi phục focus nếu phần tử vẫn tồn tại.
  - Không ghi đè text đang chỉnh sửa bằng dữ liệu cũ.

## Phát hiện nội dung cần chú ý

Phiên bản đầu có thể thực hiện ở client bằng các bước chuẩn hóa nhẹ:

- Bỏ HTML, khoảng trắng thừa và dấu câu không cần thiết.
- So sánh câu hoặc đoạn đầu giữa các nhận xét.
- Gắn cảnh báo khi cùng một cụm dài xuất hiện ở nhiều học sinh.
- Không sửa nội dung tự động và không gửi dữ liệu mới tới AI chỉ để kiểm tra trùng.

Các cảnh báo khác có thể bổ sung sau khi có dữ liệu sử dụng thực tế: nhận xét quá ngắn, thiếu diễn đạt mức học, hoặc không khớp với trạng thái đi muộn/vắng.

## Trạng thái và lỗi

- Loading toàn lớp: giữ progress hiện tại và hiển thị tiến độ theo số học sinh.
- Hàng đang tạo/gửi: khóa đúng các nút của hàng đó, không khóa toàn bộ bảng nếu không cần.
- Lỗi một hàng: badge lỗi, thông báo ngắn và nút thử lại riêng.
- Lỗi chuyển chế độ hoặc tải dữ liệu: giữ chế độ hiện tại và không làm mất draft.
- Trước khi rời lớp/buổi: dùng cảnh báo unsaved hiện có, bao gồm cả draft chỉnh sửa trong bảng.
- Gửi hàng loạt luôn có xác nhận nêu rõ số lượng và phạm vi thực tế.

## Accessibility và responsive

- Bảng dùng semantic table hoặc cấu trúc grid có header/label rõ ràng.
- Mỗi textarea có label gắn với tên học sinh.
- Nút mở panel có `aria-expanded`, `aria-controls` và trạng thái focus rõ ràng.
- Hỗ trợ phím tắt:
  - `Ctrl/Cmd + Enter`: lưu chỉnh sửa hiện tại.
  - `↑/↓`: chuyển hàng khi không đang nhập text.
  - `Esc`: đóng panel.
- Desktop là ưu tiên. Ở màn hình nhỏ, bảng chuyển thành danh sách hàng có thể bung panel toàn màn hình, không ép bảng rộng gây cuộn ngang.
- Không dùng màu làm tín hiệu duy nhất; cảnh báo có text/icon.

## Kiểm thử chấp nhận

1. Sau khi tạo AI cả lớp, mở được chế độ review mà không gọi AI lần nữa.
2. Tất cả nhận xét hiện có được đọc trên một màn hình.
3. Sửa inline cập nhật đúng `generatedComments` và không mất khi render lại.
4. Mở/đóng panel không mất nội dung hoặc vị trí cuộn.
5. Mức học và ghi chú trong panel dùng đúng autosave hiện tại.
6. Tạo lại một học sinh không ảnh hưởng bản nháp các học sinh khác.
7. Gửi riêng và gửi cả lớp dùng đúng payload hiện tại.
8. Bộ lọc không làm thay đổi phạm vi của nút `Gửi tất cả`.
9. Nút `Chỉ gửi mục đang lọc` hiển thị đúng số lượng và có xác nhận.
10. Cảnh báo trùng hiển thị đúng nhưng không chặn gửi.
11. Một hàng lỗi không làm mất hoặc hủy các hàng thành công.
12. Đổi qua lại giữa review và chi tiết giữ state, filter, focus và scroll hợp lý.
13. Bàn phím và screen reader nhận diện được hàng, textarea, panel và nút thao tác.
14. Responsive ở desktop, tablet và mobile không tạo cuộn ngang không cần thiết.

## Ngoài phạm vi phiên bản đầu

- Không thay đổi prompt AI hoặc thuật toán tạo nhận xét.
- Không thêm workflow bắt buộc `Đã review`.
- Không tự động viết lại nhận xét chỉ vì phát hiện trùng.
- Không thay đổi API LMS và cấu trúc gửi nhận xét hiện tại.
- Không triển khai phân tích chất lượng nhận xét bằng một API AI riêng.
