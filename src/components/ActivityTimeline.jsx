export default function ActivityTimeline({ activities }) {
  return (
    <div className="space-y-3">
      {activities.map((a) => (
        <div key={a.id} className="border-l pl-3 border-gray-300">
          <div className="font-semibold">{a.type}</div>
          <div className="text-sm">{a.note}</div>
          <div className="text-xs text-gray-400">{a.outcome}</div>
        </div>
      ))}
    </div>
  );
}
