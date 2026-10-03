import React from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import {
  PageMetadata,
  HtmlClassNameProvider,
  ThemeClassNames,
} from "@docusaurus/theme-common";
import BlogLayout from "@theme/BlogLayout";
import BlogListPaginator from "@theme/BlogListPaginator";
import SearchMetadata from "@theme/SearchMetadata";
import BlogListPageStructuredData from "@theme/BlogListPage/StructuredData";
import { normalizeBlogItems } from "../blogContentMetadataFallback";

function BlogListPageMetadata(props) {
  const { metadata } = props;
  const {
    siteConfig: { title: siteTitle },
  } = useDocusaurusContext();
  const { blogDescription, blogTitle, permalink } = metadata;
  const isBlogOnlyMode = permalink === "/";
  const title = isBlogOnlyMode ? siteTitle : blogTitle;

  return (
    <>
      <PageMetadata title={title} description={blogDescription} />
      <SearchMetadata tag="blog_posts_list" />
    </>
  );
}

function BlogListPageContent(props) {
  const { metadata, items, sidebar } = props;

  return (
    <BlogLayout sidebar={sidebar}>
      {items.map((item) => {
        const postMetadata = item.content.metadata;

        return (
          <article key={postMetadata.permalink} className="margin-bottom--xl">
            <header>
              <h2>
                <Link href={postMetadata.permalink}>{postMetadata.title}</Link>
              </h2>
              <div className="margin-bottom--sm">
                <time dateTime={postMetadata.date}>
                  {new Date(postMetadata.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </div>
            </header>
            {postMetadata.description && <p>{postMetadata.description}</p>}
            <Link href={postMetadata.permalink}>Read more</Link>
          </article>
        );
      })}
      <BlogListPaginator metadata={metadata} />
    </BlogLayout>
  );
}

export default function BlogListPage(props) {
  const normalizedProps = {
    ...props,
    items: normalizeBlogItems(props.items, props.metadata),
  };

  return (
    <HtmlClassNameProvider
      className={clsx(
        ThemeClassNames.wrapper.blogPages,
        ThemeClassNames.page.blogListPage,
      )}>
      <BlogListPageMetadata {...normalizedProps} />
      <BlogListPageStructuredData {...normalizedProps} />
      <BlogListPageContent {...normalizedProps} />
    </HtmlClassNameProvider>
  );
}
