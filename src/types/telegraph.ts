export interface TelegraphAccount {
  short_name: string;
  author_name: string;
  author_url: string;
  access_token: string;
  auth_url?: string;
}

export interface TelegraphPage {
  path: string;
  url: string;
  title: string;
  description: string;
  author_name?: string;
  content: Array<Node>;
  views: number;
}

export interface Node {
  tag?: string;
  attrs?: Record<string, string>;
  children?: Array<Node | string>;
}
