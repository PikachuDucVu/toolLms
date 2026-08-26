import { app } from './registry.js';

const KIEMTRA_BASE = 'https://kiemtra.ducvu.io.vn';

const DEFAULT_LEARNING_LEVEL = 'understands_and_asks';

const LEARNING_LEVELS = {
            independent: {
                code: 'L4',
                label: 'Nắm vững, tự vận dụng',
                shortLabel: 'Nắm vững',
                help: 'Tự vận dụng và hoàn thành độc lập',
                prompt: 'Học sinh nắm vững kiến thức, có thể tự vận dụng và hoàn thành phần thực hành độc lập, nhanh chóng và chính xác.'
            },
            understands_and_asks: {
                code: 'L3',
                label: 'Nắm được, chủ động hỏi',
                shortLabel: 'Nắm được',
                help: 'Chủ động hỏi lại khi chưa hiểu',
                prompt: 'Học sinh nắm được kiến thức chính; với những phần chưa hiểu, học sinh chủ động hỏi lại giáo viên và có thể hoàn thành sau khi được giải đáp.'
            },
            needs_prompting: {
                code: 'L2',
                label: 'Đang củng cố, cần gợi ý',
                shortLabel: 'Đang củng cố',
                help: 'Cần thầy gợi ý ở một số bước',
                prompt: 'Học sinh nắm được một phần kiến thức nhưng vẫn cần giáo viên gợi ý hoặc hướng dẫn ở một số bước trong quá trình thực hành.'
            },
            needs_support: {
                code: 'L1',
                label: 'Chưa nắm chắc, cần hỗ trợ',
                shortLabel: 'Cần hỗ trợ',
                help: 'Cần được hướng dẫn sát hơn',
                prompt: 'Học sinh chưa nắm chắc kiến thức, còn gặp khó khăn khi tự thực hành và cần giáo viên hỗ trợ sát hơn.'
            }
        };

const PRODUCT_PROGRESS_LEVELS = {
            independent: {
                code: 'L4',
                label: 'Vượt tiến độ, tự chủ cao',
                shortLabel: 'Vượt tiến độ',
                help: 'Xong sớm tính năng chính, tự giác sáng tạo và debug tốt',
                prompt: 'Học sinh hoàn thành tốt tiến độ dự án, tự giác phát triển thêm tính năng sáng tạo và tự xử lý lỗi tốt mà ít cần hỗ trợ.'
            },
            understands_and_asks: {
                code: 'L3',
                label: 'Đúng tiến độ, thao tác tốt',
                shortLabel: 'Đúng tiến độ',
                help: 'Bám sát kế hoạch, chủ động hỏi và xử lý khi gặp lỗi',
                prompt: 'Học sinh bám sát tiến độ dự án, hoàn thành tốt các chức năng chính; khi gặp lỗi chủ động hỏi giáo viên và xử lý nhanh sau khi được hướng dẫn.'
            },
            needs_prompting: {
                code: 'L2',
                label: 'Hơi chậm tiến độ, cần gợi ý',
                shortLabel: 'Hơi chậm',
                help: 'Đã có khung, còn lúng túng khi code logic, cần làm thêm ở nhà',
                prompt: 'Học sinh đã xây dựng được khung sản phẩm nhưng tiến độ triển khai còn chậm, còn lúng túng ở một số bước logic và cần giáo viên gợi ý thêm.'
            },
            needs_support: {
                code: 'L1',
                label: 'Chậm tiến độ, cần kèm sát',
                shortLabel: 'Cần kèm sát',
                help: 'Chưa xong chức năng cốt lõi, gặp nhiều lỗi, cần làm bù ở nhà',
                prompt: 'Học sinh gặp khó khăn khi triển khai dự án nên tiến độ còn chậm so với yêu cầu, chưa hoàn thành chức năng cốt lõi và cần giáo viên hỗ trợ sát.'
            }
        };

	const _audioCache = {};

const LMS_GRAPHQL_URL = "/api/lms/graphql";

const NEW_CLASS_CUTOFF_DATE = '2026-04-05';

const DEFAULT_RATE_AREAS = [
            {grade: 5, content: "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng.\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè", commentAreaId: "66f12601cdcebc582a30307f", type: "RATE"},
            {grade: 5, content: "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật.", commentAreaId: "66f12569cdcebc582a302bd2", type: "RATE"},
            {grade: 5, content: "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán.", commentAreaId: "66f125d3cdcebc582a302f35", type: "RATE"},
            {grade: 5, content: "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, giáo viên hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên.\n", commentAreaId: "66f12637cdcebc582a30321c", type: "RATE"},
            {grade: 5, content: "- Ngoài việc nắm chắc kiến thức được hướng dẫn trong buổi học,  học viên có sự chủ động đặt câu hỏi với giáo viên để mở rộng/ nâng cao thêm vốn hiểu biết.", commentAreaId: "66f124bbcdcebc582a302727", type: "RATE"},
            {grade: 5, content: "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình, biết tối ưu hoá đoạn code và sắp xếp chỉnh chu, gọn gàng\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ giáo viên", commentAreaId: "66f12525cdcebc582a302a65", type: "RATE"},
            {grade: 5, content: "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng", commentAreaId: "66f1259bcdcebc582a302cd7", type: "RATE"}
        ];

const AREA_NAMES = [
            "Kỹ năng giao tiếp, hợp tác", "Kỹ năng giải quyết vấn đề", "Kỹ năng sử dụng máy tính",
            "Thái độ học tập trên lớp", "Kiến thức học viên đã được học tại lớp",
            "Tư duy máy tính, tư duy thuật toán", "Tư duy sáng tạo"
        ];

const CHECKPOINT_QUESTION_IDS = [
            "668e2f99e71f90e7630d4594","668e2f99e71f90e7630d4595","668e2f99e71f90e7630d4596",
            "668e2f99e71f90e7630d4597","668e2f99e71f90e7630d4598","668e2f99e71f90e7630d4599",
            "668e2f99e71f90e7630d459a","668e2f99e71f90e7630d459b","668e2f99e71f90e7630d459c",
            "668e2f99e71f90e7630d459d"
        ];

const CHECKPOINT_RATE_AREAS = [
            {grade:5,content:"- Học viên chủ động liên hệ giáo viên tìm thêm nguồn/ sách để ôn tập và học kiến thức mới tại nhà ngoài những tài liệu đã được cung cấp mà không cần yêu cầu từ giáo viên",commentAreaId:"665e7d33181e0e47f6c63768",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab6399329",courseProcessCheckpointEvaluationTitle:"KIẾN THỨC"},
            {grade:5,content:"- Ngoài việc nắm vững các kiến thức được giảng dạy, học viên còn có sự chủ động, đặt câu hỏi mở rộng trực tiếp tại lớp từ những kiến thức vừa được cung cấp",commentAreaId:"668d69d8e71f90e7630ce16c",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab6399329",courseProcessCheckpointEvaluationTitle:"KIẾN THỨC"},
            {grade:5,content:"- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật",commentAreaId:"668e0f48e71f90e7630d2db6",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932a",courseProcessCheckpointEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè",commentAreaId:"668e2e7de71f90e7630d4316",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932a",courseProcessCheckpointEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán",commentAreaId:"668e2ce1e71f90e7630d406f",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932a",courseProcessCheckpointEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ Giáo viên",commentAreaId:"668d6a25e71f90e7630ce187",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932a",courseProcessCheckpointEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng",commentAreaId:"668d6a69e71f90e7630ce198",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932a",courseProcessCheckpointEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên tập trung lắng nghe bài giảng, tự giác học tập, mentor hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên",commentAreaId:"668e2eaee71f90e7630d434f",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932b",courseProcessCheckpointEvaluationTitle:"THÁI ĐỘ"},
            {grade:5,content:"- Học viên chủ động tìm kiếm thêm các bài tập, dự án để luyện tập và đặt các câu hỏi luyện tập với giáo viên",commentAreaId:"668e2f5be71f90e7630d44c1",type:"RATE",courseProcessCheckpointEvaluationId:"66c866a56ae1a9fab639932b",courseProcessCheckpointEvaluationTitle:"THÁI ĐỘ"}
        ];

const DEMO_FALLBACKS = {
            HACKATHON: {
                label: "Điểm bài Hackathon",
                commentAreaId: "66c44cf76ae1a9fab631679d",
                courseProcessDemoId: "66c86cff6ae1a9fab639aa24",
                demoGrade: 0,
                questions: [
                    {courseProcessDemoDetailId:"66c44cf76ae1a9fab631679c", title:"Điểm Hackathon", maxScore:5}
                ]
            },
            GA: {
                label: "Demo2024 | GA",
                commentAreaId: "67074e6255bde440385042df",
                courseProcessDemoId: "68f0bcff22849dccaa447c33",
                questions: [
                    {courseProcessDemoDetailId:"67074e6255bde440385042da", title:" Tư duy máy tính, tư duy thuật toán", maxScore:2},
                    {courseProcessDemoDetailId:"67074e6255bde440385042db", title:"Tư duy sáng tạo", maxScore:1},
                    {courseProcessDemoDetailId:"67074e6255bde440385042dc", title:"Kỹ năng giao tiếp, hợp tác", maxScore:0.5},
                    {courseProcessDemoDetailId:"67074e6255bde440385042dd", title:" Giải quyết vấn đề", maxScore:0.5},
                    {courseProcessDemoDetailId:"67074e6255bde440385042de", title:"Kỹ năng sử dụng máy tính", maxScore:1}
                ]
            },
            GB: {
                label: "Demo2024 | GB",
                commentAreaId: "66c80bf66ae1a9fab6386af3",
                courseProcessDemoId: "66c815666ae1a9fab6388763",
                questions: [
                    {courseProcessDemoDetailId:"66c80bf66ae1a9fab6386aee", title:"Tư duy máy tính, tư duy thuật toán", maxScore:2},
                    {courseProcessDemoDetailId:"66c80bf66ae1a9fab6386aef", title:"Tư duy sáng tạo", maxScore:1},
                    {courseProcessDemoDetailId:"66c80bf66ae1a9fab6386af0", title:"Kỹ năng giao tiếp, hợp tác", maxScore:0.5},
                    {courseProcessDemoDetailId:"66c80bf66ae1a9fab6386af1", title:"Giải quyết vấn đề", maxScore:0.5},
                    {courseProcessDemoDetailId:"66c80bf66ae1a9fab6386af2", title:"Kỹ năng sử dụng máy tính", maxScore:1}
                ]
            }
        };

const FINAL_RATE_AREAS = [
            {grade:5,content:"- Học viên chủ động liên hệ giáo viên tìm thêm nguồn/ sách để ôn tập và học kiến thức mới tại nhà ngoài những tài liệu đã được cung cấp mà không cần yêu cầu từ giáo viên",commentAreaId:"665e7d33181e0e47f6c63768",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073af",courseProcessFinalEvaluationTitle:"KIẾN THỨC"},
            {grade:5,content:"- Ngoài việc nắm vững các kiến thức được giảng dạy, học viên còn có sự chủ động, đặt câu hỏi mở rộng trực tiếp tại lớp từ những kiến thức vừa được cung cấp",commentAreaId:"668d69d8e71f90e7630ce16c",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073af",courseProcessFinalEvaluationTitle:"KIẾN THỨC"},
            {grade:5,content:"- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè",commentAreaId:"668e2e7de71f90e7630d4316",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b0",courseProcessFinalEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật",commentAreaId:"668e0f48e71f90e7630d2db6",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b0",courseProcessFinalEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán",commentAreaId:"668e2ce1e71f90e7630d406f",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b0",courseProcessFinalEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng",commentAreaId:"668d6a69e71f90e7630ce198",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b0",courseProcessFinalEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ Giáo viên",commentAreaId:"668d6a25e71f90e7630ce187",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b0",courseProcessFinalEvaluationTitle:"KỸ NĂNG"},
            {grade:5,content:"- Học viên tập trung lắng nghe bài giảng, tự giác học tập, mentor hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên",commentAreaId:"668e2eaee71f90e7630d434f",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b1",courseProcessFinalEvaluationTitle:"THÁI ĐỘ"},
            {grade:5,content:"- Học viên chủ động tìm kiếm thêm các bài tập, dự án để luyện tập và đặt các câu hỏi luyện tập với giáo viên",commentAreaId:"668e2f5be71f90e7630d44c1",type:"RATE",courseProcessFinalEvaluationId:"67075d4b55bde440385073b1",courseProcessFinalEvaluationTitle:"THÁI ĐỘ"}
        ];

const FINAL_RATE_CONTENT_BY_AREA_ID = FINAL_RATE_AREAS.reduce((acc, area) => {
            acc[area.commentAreaId] = area.content;
            return acc;
        }, {});

const FINAL_RATE_AREA_ORDER = FINAL_RATE_AREAS.map(area => area.commentAreaId);

const FINAL_RATE_TITLE_ORDER = ["KIẾN THỨC", "KỸ NĂNG", "THÁI ĐỘ"];

const UPDATE_SLOT_COMMENT_QUERY = `mutation UpdateSlotComment($payload: UpdateSlotCommentCommand!) {
            classes {
                updateSlotComment(payload: $payload) {
                    id name
                    slots {
                        _id date startTime endTime sessionHour
                        teachers {
                            _id
                            teacher { id username code fullName email phoneNumber user imageUrl }
                            role { id name shortName }
                            isActive
                        }
                        teacherAttendance {
                            _id
                            teacher { id username fullName email phoneNumber user imageUrl }
                            status note createdBy createdAt lastModifiedBy lastModifiedAt
                        }
                        studentAttendance {
                            _id
                            student { id fullName phoneNumber email gender imageUrl customer { email } }
                            comment sendCommentStatus status
                            commentByAreas {
                                grade content commentAreaId
                                checkpoint { practiceScore checkpointScore checkpointQuestions { id title result score } }
                                courseProcessDemoId courseProcessFinalEvaluationTitle courseProcessFinalEvaluationId
                                demoQuestions { courseProcessDemoDetailId title result score maxScore }
                                type
                            }
                            createdBy createdAt lastModifiedBy lastModifiedAt
                            commentStatus { feedback status version }
                        }
                        summary homework createdAt createdBy lastModifiedAt lastModifiedBy index
                    }
                }
            }
        }`;

const NOTE_TEMPLATES = {
            good: 'Tự hoàn thành phần thực hành nhanh và chính xác',
            asks: 'Những phần chưa hiểu con chủ động hỏi lại thầy',
            needwork: 'Cần thầy gợi ý ở một số bước khi thực hành',
            naughty: 'Hay nói chuyện riêng, đôi khi mất tập trung'
        };

const CLASS_DETAIL_QUERY = `query GetClassById($id: ID!) {
            classesById(id: $id) {
                id name courseProcessId
                course { id name shortName }
                courseProcess {
                    id
                    name
                    finalSession {
                        finalEvaluations {
                            id
                            title
                            commentAreas {
                                id
                                name
                                type
                                rates { value commentSamples }
                            }
                        }
                        demoScore {
                            id
                            commentAreas {
                                id
                                name
                                type
                                demo { id title maxScore }
                            }
                        }
                    }
                }
                classSites { _id name }
                slots {
                    _id index date summary
                    studentAttendance {
                        _id
                        student { id fullName }
                        status
                        commentByAreas { grade content commentAreaId type checkpoint { practiceScore checkpointScore checkpointQuestions { id title result score } } courseProcessDemoId courseProcessFinalEvaluationTitle courseProcessFinalEvaluationId demoQuestions { courseProcessDemoDetailId title result score maxScore } }
                    }
                }
            }
        }`;

Object.assign(app, {
    KIEMTRA_BASE,
    DEFAULT_LEARNING_LEVEL,
    LEARNING_LEVELS,
    PRODUCT_PROGRESS_LEVELS,
    _audioCache,
    LMS_GRAPHQL_URL,
    NEW_CLASS_CUTOFF_DATE,
    DEFAULT_RATE_AREAS,
    AREA_NAMES,
    CHECKPOINT_QUESTION_IDS,
    CHECKPOINT_RATE_AREAS,
    DEMO_FALLBACKS,
    FINAL_RATE_AREAS,
    FINAL_RATE_CONTENT_BY_AREA_ID,
    FINAL_RATE_AREA_ORDER,
    FINAL_RATE_TITLE_ORDER,
    UPDATE_SLOT_COMMENT_QUERY,
    NOTE_TEMPLATES,
    CLASS_DETAIL_QUERY
});
