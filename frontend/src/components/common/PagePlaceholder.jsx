import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import './PagePlaceholder.css';

/**
 * Registered-but-not-yet-built route.
 *
 * The router is complete from this build step onward; the student pages land
 * in the next step and the admin pages in the one after, replacing these
 * placeholders. The endpoint list is the contract each page will call.
 */
export default function PagePlaceholder({
  title,
  description,
  icon = 'book',
  endpoints = [],
}) {
  return (
    <div className="sp-page">
      <header className="sp-page__head">
        <div>
          <h2 className="sp-page__title">{title}</h2>
          {description ? <p className="sp-page__subtitle">{description}</p> : null}
        </div>
      </header>

      <Card>
        <EmptyState
          icon={icon}
          title="This screen is being built"
          description="The route, layout, navigation and API client for this page are in place. The page itself arrives in the next build step."
          compact
        />
        {endpoints.length ? (
          <div className="sp-placeholder__endpoints">
            <p className="sp-placeholder__endpointslabel">Planned API calls</p>
            <ul>
              {endpoints.map((endpoint) => (
                <li key={endpoint}>
                  <code>{endpoint}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
