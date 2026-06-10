import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConstructionStore } from '@/store';
import { BoardReconciler } from './board-reconciler';

export function GeometryCanvas() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const reconcilerRef = useRef<BoardReconciler | null>(null);
  const construction = useConstructionStore((s) => s.construction);

  // Initialize JSXGraph board
  useEffect(() => {
    if (!containerRef.current) return;

    const id = 'jsxgraph-board';
    containerRef.current.id = id;

    reconcilerRef.current = new BoardReconciler(id);

    return () => {
      reconcilerRef.current?.destroy();
      reconcilerRef.current = null;
    };
  }, []);

  // Sync construction state to board
  useEffect(() => {
    if (!reconcilerRef.current) return;
    reconcilerRef.current.sync(construction.elements, construction.constraints);
  }, [construction.elements, construction.constraints]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
        }}
      />
      <div style={{
        position: 'absolute', top: '8px', left: '8px',
        display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        <button
          onClick={() => reconcilerRef.current?.zoomIn()}
          title={t('canvas.zoomIn')}
          style={zoomBtnStyle}
        >
          +
        </button>
        <button
          onClick={() => reconcilerRef.current?.zoomOut()}
          title={t('canvas.zoomOut')}
          style={zoomBtnStyle}
        >
          -
        </button>
        <button
          onClick={() => reconcilerRef.current?.resetView()}
          title={t('canvas.reset')}
          style={{ ...zoomBtnStyle, fontSize: '12px' }}
        >
          R
        </button>
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: '32px', height: '32px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'white', border: '1px solid #ddd', borderRadius: '6px',
  fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};
