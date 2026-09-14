function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

const comment = "<p>Nhận xét chính xác.</p>";

const oldFormatPresentWithoutSummary = {
  slotId: "slot-1",
  classSiteId: "site-1",
  sessionNumber: 3,
  classId: "class-1",
  courseProcessId: "process-1",
  slotType: "Default",
  rank: "N/A",
  totalScore: null,
  studentComment: {
    studentAttendanceId: "attendance-present",
    studentId: "student-present",
    content: "- [COD]  Kỹ năng giao tiếp, hợp tác: - Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng.\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè<br>- [COD]  Kỹ năng giải quyết vấn đề: - Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật.<br>- [COD]  Kỹ năng sử dụng máy tính: - Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán.<br>- [COD]  Thái độ học tập trên lớp: - Học viên tập trung lắng nghe bài giảng, tự giác học tập, giáo viên hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên.\n<br>- [COD]  Kiến thức học viên đã được học tại lớp: - Ngoài việc nắm chắc kiến thức được hướng dẫn trong buổi học,  học viên có sự chủ động đặt câu hỏi với giáo viên để mở rộng/ nâng cao thêm vốn hiểu biết.<br>- [COD]  Tư duy máy tính, tư duy thuật toán: - Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình, biết tối ưu hoá đoạn code và sắp xếp chỉnh chu, gọn gàng\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ giáo viên<br>- [COD]  Tư duy sáng tạo: - Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng<br>- Đánh giá chung: <p>Nhận xét chính xác.</p>",
    byAreas: [
      {
        grade: 5,
        content: "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng.\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè",
        commentAreaId: "66f12601cdcebc582a30307f",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật.",
        commentAreaId: "66f12569cdcebc582a302bd2",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán.",
        commentAreaId: "66f125d3cdcebc582a302f35",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, giáo viên hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên.\n",
        commentAreaId: "66f12637cdcebc582a30321c",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Ngoài việc nắm chắc kiến thức được hướng dẫn trong buổi học,  học viên có sự chủ động đặt câu hỏi với giáo viên để mở rộng/ nâng cao thêm vốn hiểu biết.",
        commentAreaId: "66f124bbcdcebc582a302727",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình, biết tối ưu hoá đoạn code và sắp xếp chỉnh chu, gọn gàng\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ giáo viên",
        commentAreaId: "66f12525cdcebc582a302a65",
        type: "RATE",
      },
      {
        grade: 5,
        content: "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng",
        commentAreaId: "66f1259bcdcebc582a302cd7",
        type: "RATE",
      },
      {
        content: comment,
        commentAreaId: "67b54307f79c7bc326e017ff",
        type: "CONTENT",
      },
    ],
  },
};

const oldFormatAbsentWithSummary = {
  ...oldFormatPresentWithoutSummary,
  summary: "<p>Nội dung buổi học</p>",
  studentComment: {
    ...oldFormatPresentWithoutSummary.studentComment,
    studentAttendanceId: "attendance-absent",
    studentId: "student-absent",
  },
};

const cutoffNewFormatPresentWithoutSummary = {
  slotId: "slot-1",
  classSiteId: "site-1",
  sessionNumber: 3,
  classId: "class-1",
  courseProcessId: "process-1",
  slotType: "Default",
  rank: "N/A",
  totalScore: null,
  studentComment: {
    studentAttendanceId: "attendance-present",
    studentId: "student-present",
    content: "- Đánh giá chung: <p>Nhận xét chính xác.</p>",
    byAreas: [{
      content: comment,
      commentAreaId: "67b54307f79c7bc326e017ff",
      type: "CONTENT",
    }],
  },
};

const cutoffNewFormatAbsentWithSummary = {
  ...cutoffNewFormatPresentWithoutSummary,
  summary: "<p>Nội dung buổi học</p>",
  studentComment: {
    ...cutoffNewFormatPresentWithoutSummary.studentComment,
    studentAttendanceId: "attendance-absent",
    studentId: "student-absent",
  },
};

export const regularCommentPayloadFixtures = deepFreeze({
  oldFormatPresentWithoutSummary,
  oldFormatAbsentWithSummary,
  cutoffNewFormatPresentWithoutSummary,
  cutoffNewFormatAbsentWithSummary,
});
