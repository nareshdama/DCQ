type Props = {
  className?: string;
  description: string;
  title: string;
};

export default function PanelPlaceholder({
  className = "",
  description,
  title,
}: Props) {
  const panelClassName = ["panel", "panelPlaceholder", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={panelClassName}>
      <div className="panelHeader">
        <h3>{title}</h3>
      </div>
      <div className="panelPlaceholderBody">
        <p className="muted">{description}</p>
      </div>
    </section>
  );
}
