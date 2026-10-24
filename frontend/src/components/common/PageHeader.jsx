/**
 * Page title block shared by every student page. Uses the `sp-page__*`
 * classes from styles/global.css so spacing stays consistent across routes.
 */
export default function PageHeader({ title, description, actions, children }) {
  return (
    <header className="sp-page__head">
      <div>
        <h2 className="sp-page__title">{title}</h2>
        {description ? <p className="sp-page__subtitle">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="sp-page__actions">{actions}</div> : null}
    </header>
  );
}
