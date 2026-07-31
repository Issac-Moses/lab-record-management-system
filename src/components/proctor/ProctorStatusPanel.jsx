export default function ProctorStatusPanel({
  suspicionScore = 0,
  sessionStatus = "active",
  cameraStatus = "idle",
  detectorStatus = "idle",
  warning = "",
}) {
  const normalizedCameraStatus = String(cameraStatus || "").toLowerCase();
  const normalizedDetectorStatus = String(detectorStatus || "").toLowerCase();

  const cameraLabel =
    normalizedCameraStatus === "idle"
      ? "Waiting for camera..."
      : normalizedCameraStatus === "requesting"
        ? "Requesting camera access..."
        : normalizedCameraStatus === "ready"
          ? "Camera ready"
          : normalizedCameraStatus === "denied"
            ? "Camera denied"
            : cameraStatus;

  const detectorLabel =
    normalizedDetectorStatus === "idle"
      ? "Detector not started"
      : normalizedDetectorStatus === "online"
        ? "Detector online"
        : normalizedDetectorStatus === "offline"
          ? "Detector offline"
          : detectorStatus;

  return (
    <aside className="mb-4 rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-slate-500">Session</p>
          <p className="font-semibold capitalize text-slate-800">{sessionStatus}</p>
        </div>
        <div>
          <p className="text-slate-500">Suspicion Score</p>
          <p className="font-semibold text-slate-800">{suspicionScore}</p>
        </div>
        <div>
          <p className="text-slate-500">Camera</p>
          <p className="font-semibold text-slate-800">{cameraLabel}</p>
        </div>
        <div>
          <p className="text-slate-500">AI Detector</p>
          <p className="font-semibold text-slate-800">{detectorLabel}</p>
        </div>
        <div>
          <p className="text-slate-500">Warning</p>
          <p className="font-semibold text-amber-700">{warning || "None"}</p>
        </div>
      </div>
    </aside>
  );
}
