import { ChevronRight } from "lucide-react";

type Props = {
  projectName: string | null;
  fileName: string;
  isDirty: boolean;
};

export default function AppHeader({
  projectName,
  fileName,
  isDirty,
}: Props) {
  return (
    <header className="topBar">
      <div className="titleBlock">
        <div className="titleRow">
          <h1>DCQ.io</h1>

          <div className="breadcrumb">
            {projectName ? (
              <>
                <span className="breadcrumbProject">{projectName}</span>
                <ChevronRight size={12} strokeWidth={2} className="breadcrumbSep" />
              </>
            ) : null}
            <span className="breadcrumbFile">
              {isDirty ? <span className="dirtyDot" /> : null}
              {fileName}
            </span>
          </div>
        </div>
        <p className="muted">Code-first CAD workspace</p>
      </div>
    </header>
  );
}
