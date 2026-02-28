/**
 * JSX type augmentation for <model-viewer> custom element.
 * Allows TypeScript / JSX to accept the tag without errors.
 */
/* eslint-disable @typescript-eslint/no-empty-object-type */

declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        ar?: boolean | string;
        autoplay?: boolean | string;
        loading?: 'auto' | 'lazy' | 'eager';
        reveal?: 'auto' | 'manual';
        'camera-controls'?: boolean | string;
        'auto-rotate'?: boolean | string;
        'shadow-intensity'?: string | number;
        'camera-target'?: string;
        'camera-orbit'?: string;
        'field-of-view'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'environment-image'?: string;
        'tone-mapping'?: string;
        'exposure'?: string | number;
        style?: React.CSSProperties;
      },
      HTMLElement
    >;
  }
}
