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
  type: ChatType;
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

// NH API Types
export enum PDFStatus {
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum TagType {
  TAG = "tag",
  CATEGORY = "category",
  ARTIST = "artist",
  PARODY = "parody",
  CHARACTER = "character",
  GROUP = "group",
  LANGUAGE = "language",
}

export enum ImageType {
  JPG = "j",
  PNG = "p",
  GIF = "g",
  WEBP = "w",
}

export enum ChatType {
  PRIVATE = "private",
  GROUP = "group",
  SUPERGROUP = "supergroup",
  CHANNEL = "channel",
}

export interface NHAPIResponse {
  id: number;
  media_id: string;
  title: {
    english: string;
    japanese: string;
    pretty: string;
  };
  images: {
    pages: Array<{
      t: ImageType;
      w: number;
      h: number;
      thumbnail: string;
      url: string;
      cdn_url: string;
      thumbnail_cdn: string;
    }>;
    cover: {
      t: ImageType;
      w: number;
      h: number;
    };
    thumbnail: {
      t: ImageType;
      w: number;
      h: number;
    };
  };
  scanlator: string;
  upload_date: number;
  tags: Array<{
    id: number;
    type: TagType;
    name: string;
    url: string;
    count: number;
  }>;
  num_pages: number;
  num_favorites: number;
  pdf_status: PDFStatus;
  pdf_url?: string;
}
