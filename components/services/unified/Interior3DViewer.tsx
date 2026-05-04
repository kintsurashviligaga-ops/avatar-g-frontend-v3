'use client';

type Interior3DViewerProps = {
  spatialLink: string;
  modelUrl?: string;
};

export function Interior3DViewer({ spatialLink, modelUrl }: Interior3DViewerProps) {
  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
      >
        <iframe
          title="Interior 3D Viewer"
          src={spatialLink}
          className="h-[520px] w-full"
          loading="lazy"
          allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'rgba(148,163,184,0.75)' }}>
          Interactive viewer is embedded from World Labs.
        </p>
        {modelUrl && (
          <a
            href={modelUrl}
            download
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid rgba(0,212,255,0.24)', color: '#22d3ee', background: 'rgba(0,212,255,0.06)' }}
          >
            Download 3D Model (.glb)
          </a>
        )}
      </div>
    </div>
  );
}
