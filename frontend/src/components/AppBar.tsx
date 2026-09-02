import "./AppBar.css";

export function AppBar() {
  return (
    <div className="app-bar">
      <div className="app-bar-brand">
        <span className="app-bar-mark">Caltrans</span>
        <span className="text" style={{ fontWeight: 600 }}>
          Form Converter
        </span>
      </div>
      <span className="text-soft">New conversion</span>
      <span style={{ flex: 1 }} />
      <span className="pill">Templates</span>
      <span className="pill">History</span>
    </div>
  );
}
