export const GET_CLASSES_QUERY = `query GetClasses($pageIndex: Int!, $itemsPerPage: Int!) {
  classes(payload: {
    pageIndex: $pageIndex,
    itemsPerPage: $itemsPerPage,
    orderBy: "createdAt_desc"
  }) {
    data {
      id
      name
      status
      course { id name shortName }
      classSites { _id name }
      slots {
        _id
        index
        date
        summary
        studentAttendance {
          status
          comment
          commentStatus { status }
          commentByAreas { type }
        }
      }
      startDate
      endDate
    }
    pagination { total }
  }
}`;

export const GET_CLASS_DETAIL_QUERY = `query GetClassById($id: ID!) {
  classesById(id: $id) {
    id
    name
    status
    startDate
    endDate
    courseProcessId
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
      _id
      index
      date
      summary
      studentAttendance {
        _id
        student { id fullName }
        status
        comment
        commentStatus { feedback status version }
        commentByAreas {
          grade
          content
          commentAreaId
          type
          checkpoint { practiceScore checkpointScore checkpointQuestions { id title result score } }
          courseProcessDemoId
          courseProcessFinalEvaluationTitle
          courseProcessFinalEvaluationId
          demoQuestions {
            courseProcessDemoDetailId
            title
            result
            score
            maxScore
          }
        }
      }
    }
  }
}`;

export const UPDATE_SLOT_COMMENT_QUERY = `mutation UpdateSlotComment($payload: UpdateSlotCommentCommand!) {
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

export const FIND_SUBMISSIONS_QUERY = `query FindStudentSubmissionByClass($payload: FindStudentSubmissionByClassQuery) {
  findStudentSubmissionByClass(payload: $payload) {
    students { id displayName studentUid }
    lessons { id name type isActive displayOrder }
    submissions {
      id type note score status category
      classId lessonId learningCourseId studentUid
      markedAt markedBy submittedAt submittedCount
      content { scratchState type attachments totalQuiz submitQuiz correctAnswer }
    }
  }
}`;

export const MARK_SUBMISSION_QUERY = `mutation MarkStudentSubmission($payload: MarkStudentSubmissionCommand!) {
  studentHomework {
    markStudentSubmission(payload: $payload) {
      id score status markedAt markedBy
    }
  }
}`;


export const FIND_ALL_STUDENT_WORKS_QUERY = `query findAllStudentWorks($studentId: String, $classSessionId: String, $classId: String, $classIds: [String]) {
  findAllStudentWorks(payload: {studentId_equals: $studentId, classSessionId_equals: $classSessionId, classId_equals: $classId, classId_in: $classIds}) {
    data {
      id
      status
      studentId
      classSessionId
      classId
      version
      displayOrder
      latestData {
        title
        thumbnail
        videoUrls
        imageUrl
        attachmentUrls
        comment
        rejectReason
        relatedUrls {
          name
          url
        }
      }
      createdBy {
        displayName
      }
      createdAt
      lastModifiedBy {
        displayName
      }
      lastModifiedAt
    }
  }
}`;

export const CREATE_STUDENT_WORK_MUTATION = `mutation CreateStudentWork($payload: CreateStudentWorkCommand!) {
  studentWorks {
    create(payload: $payload) {
      id
      status
      studentId
      classSessionId
      classId
      version
      displayOrder
      latestData {
        title
        thumbnail
        videoUrls
        imageUrl
        attachmentUrls
        comment
        rejectReason
        relatedUrls {
          name
          url
        }
      }
      createdBy {
        displayName
      }
      createdAt
      lastModifiedBy {
        displayName
      }
      lastModifiedAt
    }
  }
}`;

export const UPDATE_STUDENT_WORK_MUTATION = `mutation UpdateStudentWork($payload: UpdateStudentWorkCommand!) {
  studentWorks {
    update(payload: $payload) {
      id
      status
      studentId
      classSessionId
      classId
      version
      displayOrder
      latestData {
        title
        thumbnail
        videoUrls
        imageUrl
        attachmentUrls
        comment
        rejectReason
        relatedUrls {
          name
          url
        }
      }
      createdBy {
        displayName
      }
      createdAt
      lastModifiedBy {
        displayName
      }
      lastModifiedAt
    }
  }
}`;

export const DELETE_STUDENT_WORK_MUTATION = `mutation DeleteStudentWork($payload: DeleteStudentWorkCommand!) {
  studentWorks {
    del(payload: $payload) {
      id
    }
  }
}`;

export const ALLOWED_LMS_OPERATIONS = new Set([
  "GetClasses",
  "GetClassById",
  "UpdateSlotComment",
  "FindStudentSubmissionByClass",
  "MarkStudentSubmission",
  "FindAllWithClass",
  "findAllStudentWorks",
  "CreateStudentWork",
  "UpdateStudentWork",
  "DeleteStudentWork",
]);
