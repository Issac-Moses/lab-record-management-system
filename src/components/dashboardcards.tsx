export default function DashboardCards() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      
      <div className="card p-6">
        <p className="text-slate-500">Total Experiments</p>
        <p className="text-3xl font-bold mt-2">42</p>
      </div>

      <div className="card p-6">
        <p className="text-slate-500">Pending Evaluations</p>
        <p className="text-3xl font-bold mt-2">7</p>
      </div>

    </div>
  );
}