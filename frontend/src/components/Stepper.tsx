import "./Stepper.css";

const STEPS = ["Upload", "Template", "Processing", "Review & Export"];

export function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <span key={label} style={{ display: "contents" }}>
            <span className={`pill ${n === step ? "pill-active" : ""}`}>
              {n} {label}
            </span>
            {n < STEPS.length && <span className="stepper-rule" />}
          </span>
        );
      })}
    </div>
  );
}
