const blogMetadataContext = require.context(
  "@generated/docusaurus-plugin-content-blog/default",
  false,
  /^\.\/site-docs-blog-.*\.json$/,
);

const blogArchiveContext = require.context(
  "@generated/docusaurus-plugin-content-blog/default/p",
  false,
  /^\.\/.*blog-archive-.*\.json$/,
);

const fallbackMetadataByPermalink = new Map(
  blogMetadataContext.keys().map((key) => {
    const mod = blogMetadataContext(key);
    const metadata = mod.default ?? mod;
    return [metadata.permalink, metadata];
  }),
);

const orderedArchiveEntries = blogArchiveContext
  .keys()
  .flatMap((key) => {
    const mod = blogArchiveContext(key);
    const archive = mod.default ?? mod;
    return archive.archive?.blogPosts ?? [];
  });

const fallbackEntryByPermalink = new Map(
  orderedArchiveEntries
    .filter((post) => post?.metadata?.permalink)
    .map((post) => [post.metadata.permalink, post]),
);

const orderedFallbackMetadata = orderedArchiveEntries
  .map((post) => post.metadata)
  .filter(Boolean);

function hasOwnKeys(value) {
  return Boolean(value) && Object.keys(value).length > 0;
}

function cloneContentWithFallback(content, metadata) {
  if (!content || !metadata) {
    return content;
  }

  return Object.assign(content, {
    metadata,
    frontMatter: hasOwnKeys(content.frontMatter)
      ? content.frontMatter
      : (metadata.frontMatter ?? {}),
    assets: content.assets ?? {},
  });
}

export function getBlogMetadataByPermalink(permalink) {
  if (!permalink) {
    return undefined;
  }

  return fallbackMetadataByPermalink.get(permalink);
}

export function getBlogArchiveEntryByPermalink(permalink) {
  if (!permalink) {
    return undefined;
  }

  return fallbackEntryByPermalink.get(permalink);
}

export function ensureBlogContentMetadata(content, metadata) {
  if (!content) {
    return content;
  }

  if (content.metadata) {
    return cloneContentWithFallback(content, metadata ?? content.metadata);
  }

  if (!metadata) {
    return content;
  }

  return cloneContentWithFallback(content, metadata);
}

export function normalizeBlogItems(items, metadata) {
  const page = metadata?.page ?? 1;
  const postsPerPage = metadata?.postsPerPage ?? items.length;
  const startIndex = Math.max(page - 1, 0) * postsPerPage;
  const fallbackPageMetadata = orderedFallbackMetadata.slice(
    startIndex,
    startIndex + items.length,
  );

  return items.map((item) => ({
    ...item,
    content: ensureBlogContentMetadata(
      item.content,
      fallbackPageMetadata.shift(),
    ),
  }));
}
