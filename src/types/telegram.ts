export interface Update {
  message?: Message;
  edited_message?: Message;
  channel_post?: Message;
  edited_channel_post?: Message;
  callback_query?: CallbackQuery;
  [key: string]: any;
}

export interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  [key: string]: any;
}

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  [key: string]: any;
}

export interface Chat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: any;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
  game_short_name?: string;
  [key: string]: any;
}

export interface TelegramResponse<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    migrate_to_chat_id?: number;
    retry_after?: number;
    [key: string]: any;
  };
}
