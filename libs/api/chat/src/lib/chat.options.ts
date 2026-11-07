/** Settings of the chat domain, provided by the app that imports it. */
export interface ChatModuleOptions {
  /** chat_db connection string. */
  databaseUrl: string;
}

export const CHAT_OPTIONS = Symbol('CHAT_OPTIONS');
