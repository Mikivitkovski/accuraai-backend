export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string[];
  tag?: string | null;
  published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
};
