// Field limits shared by validation (server), forms (client) and tests.

export const EMAIL_MAX_LENGTH = 254;

/** Usernames are stored lowercase: 3–20 of `a-z`, `0-9`, `_`. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const DISPLAY_NAME_MAX_LENGTH = 40;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const GROUP_NAME_MAX_LENGTH = 60;
/** Members of a new group, not counting its creator. */
export const GROUP_MIN_OTHER_MEMBERS = 1;
export const GROUP_MAX_OTHER_MEMBERS = 49;

export const USER_SEARCH_MIN_QUERY_LENGTH = 2;
export const USER_SEARCH_MAX_RESULTS = 10;

export const MESSAGES_PAGE_DEFAULT_LIMIT = 30;
export const MESSAGES_PAGE_MAX_LIMIT = 100;
