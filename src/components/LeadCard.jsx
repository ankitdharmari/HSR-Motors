export default function LeadCard({ lead }) {
  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="font-bold">{lead.full_name}</div>
      <div className="text-sm text-gray-500">{lead.phone}</div>
      <div className="text-xs text-gray-400">{lead.status}</div>
    </div>
  );
}
