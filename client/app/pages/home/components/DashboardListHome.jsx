import React, { useState, useEffect } from "react";
import Link from "@/components/Link";
import { Dashboard } from "@/services/dashboard";

export default function DashboardListHome() {
  const [dashboards, setDashboards] = useState([]);

  useEffect(() => {
    Dashboard.query({ page_size: 20 }).then(({ results }) => setDashboards(results));
  }, []);

  return (
    <div className="tile">
      <div className="t-body tb-padding">
        <div className="d-flex align-items-center m-b-20">
          <p className="flex-fill f-500 c-black m-0">Dashboards</p>
        </div>
        <div role="list" className="list-group">
          {dashboards.map(d => (
            <Link key={d.id} role="listitem" className="list-group-item" href={`/dashboards/viewer/${d.id}`}> 
              {d.name}
              {d.is_draft && <span className="label label-default m-l-5">Unpublished</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
