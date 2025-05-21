import { isEmpty } from "lodash";
import React from "react";
import PropTypes from "prop-types";

import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import BigMessage from "@/components/BigMessage";
import PageHeader from "@/components/PageHeader";
import Parameters from "@/components/Parameters";
import DashboardGrid from "@/components/dashboards/DashboardGrid";
import Filters from "@/components/Filters";

import { Dashboard } from "@/services/dashboard";
import routes from "@/services/routes";

import useDashboard from "./hooks/useDashboard";

import "./PublicDashboardPage.less";

function ViewerDashboard({ dashboard }) {
  const { globalParameters, filters, setFilters, refreshDashboard, loadWidget, refreshWidget } = useDashboard(
    dashboard
  );

  return (
    <div className="container p-t-10 p-b-20">
      <PageHeader title={dashboard.name} />
      {!isEmpty(globalParameters) && (
        <div className="m-b-10 p-15 bg-white tiled">
          <Parameters parameters={globalParameters} onValuesChange={refreshDashboard} />
        </div>
      )}
      {!isEmpty(filters) && (
        <div className="m-b-10 p-15 bg-white tiled">
          <Filters filters={filters} onChange={setFilters} />
        </div>
      )}
      <div id="dashboard-container">
        <DashboardGrid
          dashboard={dashboard}
          widgets={dashboard.widgets}
          filters={filters}
          isEditing={false}
          isPublic
          onLoadWidget={loadWidget}
          onRefreshWidget={refreshWidget}
        />
      </div>
    </div>
  );
}

ViewerDashboard.propTypes = {
  dashboard: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

class DashboardViewerPage extends React.Component {
  static propTypes = {
    dashboardId: PropTypes.string.isRequired,
    onError: PropTypes.func,
  };

  static defaultProps = {
    onError: () => {},
  };

  state = {
    loading: true,
    dashboard: null,
  };

  componentDidMount() {
    Dashboard.getViewer({ id: this.props.dashboardId })
      .then(dashboard => this.setState({ dashboard, loading: false }))
      .catch(error => this.props.onError(error));
  }

  render() {
    const { loading, dashboard } = this.state;
    return (
      <div className="public-dashboard-page">
        {loading ? (
          <div className="container loading-message">
            <BigMessage className="" icon="fa-spinner fa-2x fa-pulse" message="Loading..." />
          </div>
        ) : (
          <ViewerDashboard dashboard={dashboard} />
        )}
      </div>
    );
  }
}

routes.register(
  "Dashboards.Viewer",
  routeWithUserSession({
    path: "/dashboards/viewer/:dashboardId",
    render: pageProps => <DashboardViewerPage {...pageProps} dashboardId={pageProps.routeParams.dashboardId} />,
  })
);

export default DashboardViewerPage;
