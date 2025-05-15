class customException {
  status;
  message;
  err;

  constructor(status, message, err) {
    this.status = status || 500;
    this.message = message;
    this.err = err;
  }
}

class BadRequestException extends customException {
  constructor(message = "입력한 데이터가 올바르지 않습니다.", err = null) {
    super(400, message, err);
  }
}

class UnauthorizedException extends customException {
  constructor(message = "인증되지 않은 접근입니다.", err = null) {
    super(401, message, err);
  }
}

class ForbiddenException extends customException {
  constructor(message = "접근 권한이 없습니다.", err = null) {
    super(403, message, err);
  }
}

class NotFoundException extends customException {
  constructor(message = "요청하신 정보를 찾을 수 없습니다.", err = null) {
    super(404, message, err);
  }
}

class ConflictException extends customException {
  constructor(
    message = "동일한 값이 이미 데이터베이스에 존재합니다.",
    err = null
  ) {
    super(409, message, err);
  }
}

class TooManyRequestsException extends customException {
  constructor(
    message = "요청 횟수 제한을 초과하였습니다. 잠시 후 다시 시도해 주세요.",
    err = null
  ) {
    super(429, message, err);
  }
}

module.exports = {
  customException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  TooManyRequestsException,
};
