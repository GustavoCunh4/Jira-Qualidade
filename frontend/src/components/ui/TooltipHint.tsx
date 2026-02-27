import Icon from "./Icon";

export default function TooltipHint({ text }: { text: string }) {
  return (
    <span className="ui-tooltip" tabIndex={0} aria-label={text} title={text}>
      <Icon name="info" size={14} />
      <span className="ui-tooltip__bubble">{text}</span>
    </span>
  );
}
