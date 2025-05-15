// checkValidity 정규식
const EMAIL_REGEX = /^(?!\.)(?!.*\.\.)(?=.{5,320})[a-zA-Z\d.!#$%&'*+/=?^_{|}~-]{1,64}(?<!\.)@(?!-)(?!.*--)(?=.{3,255}$)([a-zA-Z\d-]{1,63}(?:\.[a-zA-Z\d-]{1,63})*(?<!-)\.[a-zA-Z]{1,63})$/
const NICKNAME_REGEX = /^[^\s]{1,20}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{10,18}$/;
const TITLE_REGEX = /^.{1,30}$/;
const COMMENT_CONTENT_REGEX = /^.{1,300}$/;
const DATE_REGEX = /^(?:(?:20(?:2[\d]|30)(?:(?:0[13578]|1[02])(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)(?:0[1-9]|[12]\d|30)|02(?:0[1-9]|1\d|2[0-8])))|(?:202[48])0229)$/;
const PARAM_REGEX = /^(?!0)[\d]+$/

// token 발급시간
const EXPIRESIN = "10h";

module.exports = {
    EMAIL_REGEX,
    NICKNAME_REGEX,
    PASSWORD_REGEX,
    TITLE_REGEX,
    COMMENT_CONTENT_REGEX,
    DATE_REGEX,
    PARAM_REGEX,
    EXPIRESIN
};