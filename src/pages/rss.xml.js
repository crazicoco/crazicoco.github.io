import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('posts');
  return rss({
    title: '飞絮的数据屋',
    description: '数据科学、数据分析与因果推断',
    site: context.site,
    items: posts
      .filter((p) => !p.data.draft)
      .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
      .map((post) => ({
        title: post.data.title,
        description: post.data.excerpt || '',
        pubDate: post.data.date,
        link: `/posts/${post.id}`,
      })),
  });
}
