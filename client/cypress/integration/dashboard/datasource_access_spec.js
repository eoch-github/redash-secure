describe("Dashboard Access via Datasource Permissions", () => {
  let adminUser;
  let dashboardOnlyUser;
  let regularUser;
  let dashboardOnlyGroup;
  let regularGroup;
  let jsonDataSource;
  let postgresDataSource;

  before(() => {
    // Setup users and groups
    cy.login();
    
    // Create datasources
    cy.createDataSource("Test JSON API", "json", {
      base_url: "https://jsonplaceholder.typicode.com"
    }).then(ds => {
      jsonDataSource = ds;
      
      return cy.createDataSource("Test Postgres", "pg", {
        host: "postgres",
        port: 5432,
        user: "postgres",
        password: "postgres",
        dbname: "postgres"
      });
    }).then(ds => {
      postgresDataSource = ds;
      
      // Create dashboard-only group
      return cy.request("POST", "/api/groups", {
        name: "Dashboard Access Test Group",
        type: "dashboard_only",
        permissions: ["view_query_results_without_permission"]
      });
    }).then(({ body: group }) => {
      dashboardOnlyGroup = group;
      
      // Create regular group
      return cy.request("POST", "/api/groups", {
        name: "Regular Access Test Group"
      });
    }).then(({ body: group }) => {
      regularGroup = group;
      
      // Create users
      return cy.createUser({
        name: "Dashboard Test User",
        email: "dashboard.test@example.com",
        password: "testpass123"
      });
    }).then(() => {
      return cy.createUser({
        name: "Regular Test User",
        email: "regular.test@example.com",
        password: "testpass123"
      });
    }).then(() => {
      // Add users to groups
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/members`, {
        user_email: "dashboard.test@example.com"
      });
      
      cy.request("POST", `/api/groups/${regularGroup.id}/members`, {
        user_email: "regular.test@example.com"
      });
    });
  });

  describe("Dashboard Visibility", () => {
    let jsonDashboard;
    let postgresDashboard;
    let mixedDashboard;

    beforeEach(() => {
      cy.login();
      
      // Create dashboards with different datasources
      cy.createQuery({
        name: "JSON Query",
        query: JSON.stringify({ path: "/posts/1" }),
        data_source_id: jsonDataSource.id
      }).then(query => {
        return cy.createDashboard("JSON Dashboard").then(dashboard => {
          jsonDashboard = dashboard;
          return cy.addWidget(dashboard.id, query.visualizations[0].id);
        });
      });
      
      cy.createQuery({
        name: "Postgres Query",
        query: "SELECT 1 as test",
        data_source_id: postgresDataSource.id
      }).then(query => {
        return cy.createDashboard("Postgres Dashboard").then(dashboard => {
          postgresDashboard = dashboard;
          return cy.addWidget(dashboard.id, query.visualizations[0].id);
        });
      });
      
      // Create mixed dashboard
      cy.createQuery({
        name: "Mixed Query 1",
        query: JSON.stringify({ path: "/posts/2" }),
        data_source_id: jsonDataSource.id
      }).then(query1 => {
        return cy.createQuery({
          name: "Mixed Query 2",
          query: "SELECT 2 as test",
          data_source_id: postgresDataSource.id
        }).then(query2 => {
          return cy.createDashboard("Mixed Dashboard").then(dashboard => {
            mixedDashboard = dashboard;
            return cy.addWidget(dashboard.id, query1.visualizations[0].id).then(() => {
              return cy.addWidget(dashboard.id, query2.visualizations[0].id, {
                position: { col: 3, row: 0, sizeX: 3, sizeY: 3 }
              });
            });
          });
        });
      });
    });

    it("dashboard-only user sees only dashboards with accessible datasources", () => {
      // Give dashboard-only group access to JSON datasource only
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: jsonDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      // Check dashboard list
      cy.visit("/dashboards");
      
      // Should see JSON dashboard
      cy.contains("JSON Dashboard").should("exist");
      
      // Should NOT see Postgres dashboard
      cy.contains("Postgres Dashboard").should("not.exist");
      
      // Should NOT see Mixed dashboard (requires both datasources)
      cy.contains("Mixed Dashboard").should("not.exist");
    });

    it("dashboard-only user sees mixed dashboard when has access to all datasources", () => {
      // Give dashboard-only group access to both datasources
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: jsonDataSource.id,
        view_only: true
      });
      
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: postgresDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      // Check dashboard list
      cy.visit("/dashboards");
      
      // Should see all dashboards
      cy.contains("JSON Dashboard").should("exist");
      cy.contains("Postgres Dashboard").should("exist");
      cy.contains("Mixed Dashboard").should("exist");
      
      // Can access mixed dashboard
      cy.contains("Mixed Dashboard").click();
      cy.contains("h3", "Mixed Dashboard").should("exist");
      
      // Both widgets should load
      cy.get(".widget-visualization").should("have.length", 2);
    });

    it("regular user with datasource access can see all dashboards", () => {
      // Give regular group access to JSON datasource with full permissions
      cy.request("POST", `/api/groups/${regularGroup.id}/data_sources`, {
        data_source_id: jsonDataSource.id,
        view_only: false
      });
      
      // Login as regular user
      cy.logout();
      cy.login("regular.test@example.com", "testpass123");
      
      // Regular users should see all dashboards regardless of datasource
      cy.visit("/dashboards");
      
      // Should see all dashboards
      cy.contains("JSON Dashboard").should("exist");
      cy.contains("Postgres Dashboard").should("exist");
      cy.contains("Mixed Dashboard").should("exist");
    });
  });

  describe("Dashboard Direct Access", () => {
    let restrictedDashboard;

    beforeEach(() => {
      cy.login();
      
      // Create a dashboard with postgres datasource
      cy.createQuery({
        name: "Restricted Query",
        query: "SELECT 'restricted' as data",
        data_source_id: postgresDataSource.id
      }).then(query => {
        return cy.createDashboard("Restricted Dashboard").then(dashboard => {
          restrictedDashboard = dashboard;
          return cy.addWidget(dashboard.id, query.visualizations[0].id);
        });
      });
    });

    it("dashboard-only user cannot access dashboard via direct URL without datasource access", () => {
      // Don't give access to postgres datasource
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      // Try direct access
      cy.visit(`/dashboards/${restrictedDashboard.id}`, { failOnStatusCode: false });
      
      // Should show permission error
      cy.contains("You don't have permission to access this page").should("exist");
    });

    it("dashboard-only user can access dashboard via direct URL with datasource access", () => {
      // Give access to postgres datasource
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: postgresDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      // Try direct access
      cy.visit(`/dashboards/${restrictedDashboard.id}`);
      
      // Should load successfully
      cy.contains("h3", "Restricted Dashboard").should("exist");
      cy.get(".widget-visualization").should("exist");
    });
  });

  describe("Widget Loading", () => {
    let testDashboard;

    beforeEach(() => {
      cy.login();
      
      // Create dashboard with multiple widgets from different datasources
      cy.createQuery({
        name: "Widget Query 1",
        query: JSON.stringify({ path: "/users/1" }),
        data_source_id: jsonDataSource.id
      }).then(query1 => {
        return cy.createQuery({
          name: "Widget Query 2",
          query: "SELECT 'test' as data",
          data_source_id: postgresDataSource.id
        }).then(query2 => {
          return cy.createDashboard("Widget Test Dashboard").then(dashboard => {
            testDashboard = dashboard;
            return cy.addWidget(dashboard.id, query1.visualizations[0].id).then(() => {
              return cy.addWidget(dashboard.id, query2.visualizations[0].id, {
                position: { col: 3, row: 0, sizeX: 3, sizeY: 3 }
              });
            });
          });
        });
      });
    });

    it("dashboard-only user sees error for widgets from inaccessible datasources", () => {
      // Give access only to JSON datasource
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: jsonDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      // This test assumes the dashboard is still accessible because at least one datasource is available
      // In the actual implementation, this might need adjustment based on the business logic
      cy.visit(`/dashboards/${testDashboard.id}`);
      
      // First widget should load
      cy.get(".widget-visualization").first().should("exist");
      
      // Second widget should show permission error
      cy.contains("Error running query").should("exist");
    });
  });

  describe("Search and Filter", () => {
    beforeEach(() => {
      cy.login();
      
      // Create multiple dashboards
      for (let i = 1; i <= 3; i++) {
        cy.createQuery({
          name: `Search Query ${i}`,
          query: JSON.stringify({ path: `/posts/${i}` }),
          data_source_id: jsonDataSource.id
        }).then(query => {
          return cy.createDashboard(`Searchable Dashboard ${i}`).then(dashboard => {
            return cy.addWidget(dashboard.id, query.visualizations[0].id);
          });
        });
      }
      
      // Create postgres dashboards
      for (let i = 1; i <= 2; i++) {
        cy.createQuery({
          name: `PG Query ${i}`,
          query: `SELECT ${i} as num`,
          data_source_id: postgresDataSource.id
        }).then(query => {
          return cy.createDashboard(`Postgres Dashboard ${i}`).then(dashboard => {
            return cy.addWidget(dashboard.id, query.visualizations[0].id);
          });
        });
      }
    });

    it("dashboard-only user search results respect datasource permissions", () => {
      // Give access only to JSON datasource
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: jsonDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.test@example.com", "testpass123");
      
      cy.visit("/dashboards");
      
      // Search for "Dashboard"
      cy.get("input[placeholder='Search Dashboards...']").type("Dashboard");
      
      // Should see only JSON-based dashboards
      cy.contains("Searchable Dashboard 1").should("exist");
      cy.contains("Searchable Dashboard 2").should("exist");
      cy.contains("Searchable Dashboard 3").should("exist");
      
      // Should NOT see Postgres dashboards
      cy.contains("Postgres Dashboard 1").should("not.exist");
      cy.contains("Postgres Dashboard 2").should("not.exist");
    });
  });
}); 