export default function StatusBadge({ status }) {
  const colors = {
    New: "bg-blue-100 text-blue-600",
    Contacted: "bg-yellow-100 text-yellow-600",
    "Follow-up": "bg-purple-100 text-purple-600",
    Qualified: "bg-green-100 text-green-600",
    "Not Interested": "bg-red-100 text-red-600",
    Closed: "bg-gray-200 text-gray-600",
  };

  return (
    <span className={`px-3 py-1 rounded text-xs font-semibold ${colors[status]}`}>
      {status}
    </span>
  );
}
