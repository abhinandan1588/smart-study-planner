import Card from '../ui/Card';
import Skeleton, { SkeletonCard } from '../ui/Skeleton';

/**
 * Skeleton layout shown while a page's first fetch is in flight (PRD 9).
 * `tiles` renders the compact metric row, `cards` the content blocks below.
 */
export default function PageLoader({ tiles = 0, cards = 2, lines = 3 }) {
  return (
    <div className="sp-stack" aria-busy="true">
      {tiles > 0 ? (
        <div className="sp-grid sp-grid--4">
          {Array.from({ length: tiles }).map((_, index) => (
            <Card key={`tile-${index}`}>
              <Skeleton variant="text" width="52%" />
              <Skeleton variant="text" width="34%" />
            </Card>
          ))}
        </div>
      ) : null}
      {Array.from({ length: cards }).map((_, index) => (
        <Card key={`card-${index}`}>
          <SkeletonCard lines={lines} />
        </Card>
      ))}
    </div>
  );
}
