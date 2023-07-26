declare module 'astro:assets' {
  type ImageMetadata = import('astro/assets').LocalImageProps<unknown>['src'];
  type ImageOutputFormat = import('astro/assets').LocalImageProps<unknown>['format'];
  type ImageQuality = import('astro/assets').LocalImageProps<unknown>['quality'];

  export type ImageTransform = {
    src: ImageMetadata | string;
    width?: number | undefined;
    height?: number | undefined;
    quality?: ImageQuality | undefined;
    format?: ImageOutputFormat | undefined;
    [key: string]: any;
  };

  export interface GetImageResult {
    rawOptions: ImageTransform;
    options: ImageTransform;
    src: string;
    attributes: Record<string, any>;
  }

  export function getImage(options: ImageTransform): Promise<GetImageResult>;
}
