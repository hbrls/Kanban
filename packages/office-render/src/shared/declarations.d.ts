// Type declarations for CSS Modules (.module.css)
declare module "*.module.css" {
  const styles: { readonly [className: string]: string };
  export = styles;
}
