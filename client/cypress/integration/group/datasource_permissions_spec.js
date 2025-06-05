describe("Datasource Group Permissions", () => {
  beforeEach(() => {
    cy.login();
  });

  describe("Group Datasource Management", () => {
    it("allows admin to add datasources to groups", () => {
      // Create a new group
      cy.request("POST", "/api/groups", { name: "Test Dashboard Group" }).then(({ body: group }) => {
        cy.visit(`/groups/${group.id}`);
        
        // Check that the datasources link exists and click it
        cy.contains("a", "Data Sources").click();
        
        // Add a datasource to the group
        cy.contains("button", "Add Data Sources").click();
        
        // Search and select a datasource
        cy.get("input[placeholder='Search data sources...']").type("Test PostgreSQL");
        cy.contains("Test PostgreSQL").click();
        
        // Click Add button
        cy.get(".ant-modal").within(() => {
          cy.contains("button", "Add").click();
        });
        
        // Verify datasource was added
        cy.contains("Test PostgreSQL").should("exist");
        cy.contains("View Only").should("exist");
      });
    });

    it("allows admin to remove datasources from groups", () => {
      // Create a group with a datasource
      cy.request("POST", "/api/groups", { name: "Test Group With DS" }).then(({ body: group }) => {
        // Add datasource via API
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: true
        });
        
        cy.visit(`/groups/${group.id}`);
        cy.contains("a", "Data Sources").click();
        
        // Remove the datasource
        cy.contains("button", "Remove").click();
        
        // Verify datasource was removed
        cy.contains("There are no data sources in this group yet.").should("exist");
      });
    });

    it("allows admin to toggle view-only permission", () => {
      cy.request("POST", "/api/groups", { name: "Test Permission Toggle" }).then(({ body: group }) => {
        // Add datasource with full access
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: false
        });
        
        cy.visit(`/groups/${group.id}`);
        cy.contains("a", "Data Sources").click();
        
        // Toggle to view-only
        cy.contains("button", "Full Access").click();
        cy.get(".ant-dropdown-menu").within(() => {
          cy.contains("View Only").click();
        });
        cy.contains("button", "View Only").should("exist");
        
        // Toggle back to full access
        cy.contains("button", "View Only").click();
        cy.get(".ant-dropdown-menu").within(() => {
          cy.contains("Full Access").click();
        });
        cy.contains("button", "Full Access").should("exist");
      });
    });
  });

  describe("Dashboard-Only User Access", () => {
    let dashboardOnlyUser;
    let dashboardOnlyGroup;
    let testDashboard;
    let testQuery;
    let testDataSource;

    beforeEach(() => {
      // Create a JSON datasource
      cy.createDataSource("JSON Test Source", "json", {
        base_url: "https://jsonplaceholder.typicode.com"
      }).then(ds => {
        testDataSource = ds;
        
        // Create a query using the JSON datasource
        return cy.createQuery({
          name: "Test JSON Query",
          query: JSON.stringify({ path: "/posts/1" }),
          data_source_id: ds.id
        });
      }).then(query => {
        testQuery = query;
        
        // Create a dashboard with the query
        return cy.createDashboard("Test Dashboard for Permissions");
      }).then(dashboard => {
        testDashboard = dashboard;
        
        // Add widget to dashboard
        return cy.addWidget(dashboard.id, testQuery.visualizations[0].id);
      }).then(() => {
        // Create dashboard-only group
        return cy.request("POST", "/api/groups", {
          name: "Dashboard Only Test Group",
          permissions: ["view_query_results_without_permission"],
          type: "dashboard_only"
        });
      }).then(({ body: group }) => {
        dashboardOnlyGroup = group;
        
        // Create dashboard-only user
        return cy.createUser({
          name: "Dashboard User",
          email: "dashboard.user@example.com",
          password: "password123"
        });
      }).then(() => {
        // Add user to dashboard-only group
        return cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/members`, {
          user_email: "dashboard.user@example.com"
        });
      });
    });

    it("dashboard-only user can see dashboards when group has datasource access", () => {
      // Add datasource to group
      cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
        data_source_id: testDataSource.id,
        view_only: true
      });
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.user@example.com", "password123");
      
      // Visit dashboards page
      cy.visit("/dashboards");
      
      // Should see the dashboard
      cy.contains("Test Dashboard for Permissions").should("exist");
      
      // Can view the dashboard
      cy.visit(`/dashboards/${testDashboard.id}`);
      cy.getByTestId("DashboardHeader").should("contain", "Test Dashboard for Permissions");
      
      // Widget should load successfully
      cy.getByTestId("TableVisualization").should("exist");
    });

    it("dashboard-only user cannot see dashboards when group lacks datasource access", () => {
      // Don't add datasource to group
      
      // Login as dashboard-only user
      cy.logout();
      cy.login("dashboard.user@example.com", "password123");
      
      // Visit dashboards page
      cy.visit("/dashboards");
      
      // Should not see the dashboard
      cy.contains("Test Dashboard for Permissions").should("not.exist");
      
      // Direct access should be denied
      cy.visit(`/dashboards/${testDashboard.id}`, { failOnStatusCode: false });
      cy.contains("You don't have permission to access this page").should("exist");
    });

    it("dashboard-only user sees only dashboards with accessible datasources", () => {
      // Create second datasource and dashboard
      cy.createDataSource("Second JSON Source", "json", {
        base_url: "https://jsonplaceholder.typicode.com"
      }).then(ds2 => {
        return cy.createQuery({
          name: "Second Query",
          query: JSON.stringify({ path: "/posts/2" }),
          data_source_id: ds2.id
        }).then(query2 => {
          return cy.createDashboard("Second Dashboard").then(dashboard2 => {
            return cy.addWidget(dashboard2.id, query2.visualizations[0].id).then(() => {
              // Add only first datasource to group
              return cy.request("POST", `/api/groups/${dashboardOnlyGroup.id}/data_sources`, {
                data_source_id: testDataSource.id,
                view_only: true
              });
            });
          });
        });
      }).then(() => {
        // Login as dashboard-only user
        cy.logout();
        cy.login("dashboard.user@example.com", "password123");
        
        // Visit dashboards page
        cy.visit("/dashboards");
        
        // Should see only the first dashboard
        cy.contains("Test Dashboard for Permissions").should("exist");
        cy.contains("Second Dashboard").should("not.exist");
      });
    });
  });

  describe("Query Execution Permissions", () => {
    let viewOnlyGroup;
    let fullAccessGroup;
    let testDataSource;

    beforeEach(() => {
      // Create a JSON datasource
      cy.createDataSource("Execution Test Source", "json", {
        base_url: "https://jsonplaceholder.typicode.com"
      }).then(ds => {
        testDataSource = ds;
        
        // Create view-only group
        return cy.request("POST", "/api/groups", { name: "View Only Group" });
      }).then(({ body: group }) => {
        viewOnlyGroup = group;
        
        // Add datasource with view-only permission
        return cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: testDataSource.id,
          view_only: true
        });
      }).then(() => {
        // Create full access group
        return cy.request("POST", "/api/groups", { name: "Full Access Group" });
      }).then(({ body: group }) => {
        fullAccessGroup = group;
        
        // Add datasource with full access
        return cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: testDataSource.id,
          view_only: false
        });
      });
    });

    it("users in view-only group cannot execute queries", () => {
      // Create user in view-only group
      cy.createUser({
        name: "View Only User",
        email: "viewonly@example.com",
        password: "password123"
      }).then(() => {
        return cy.request("POST", `/api/groups/${viewOnlyGroup.id}/members`, {
          user_email: "viewonly@example.com"
        });
      }).then(() => {
        // Create a query
        return cy.createQuery({
          name: "Test Execution Query",
          query: JSON.stringify({ path: "/posts/1" }),
          data_source_id: testDataSource.id
        });
      }).then(query => {
        // Login as view-only user
        cy.logout();
        cy.login("viewonly@example.com", "password123");
        
        // Visit query page
        cy.visit(`/queries/${query.id}`);
        
        // Execute button should be disabled
        cy.getByTestId("ExecuteButton").should("be.disabled");
        cy.contains("You don't have permission to run queries with this data source").should("exist");
      });
    });

    it("users in full access group can execute queries", () => {
      // Create user in full access group
      cy.createUser({
        name: "Full Access User",
        email: "fullaccess@example.com",
        password: "password123"
      }).then(() => {
        return cy.request("POST", `/api/groups/${fullAccessGroup.id}/members`, {
          user_email: "fullaccess@example.com"
        });
      }).then(() => {
        // Create a query
        return cy.createQuery({
          name: "Test Full Access Query",
          query: JSON.stringify({ path: "/posts/1" }),
          data_source_id: testDataSource.id
        });
      }).then(query => {
        // Login as full access user
        cy.logout();
        cy.login("fullaccess@example.com", "password123");
        
        // Visit query page
        cy.visit(`/queries/${query.id}`);
        
        // Execute button should be enabled
        cy.getByTestId("ExecuteButton").should("not.be.disabled");
        
        // Execute the query
        cy.getByTestId("ExecuteButton").click();
        cy.getByTestId("TableVisualization", { timeout: 10000 }).should("exist");
      });
    });
  });

  describe("Dashboard-Only Group Type", () => {
    it("automatically sets datasources to view-only for dashboard-only groups", () => {
      // Create dashboard-only group
      cy.request("POST", "/api/groups", {
        name: "Auto View Only Group",
        type: "dashboard_only",
        permissions: ["view_query_results_without_permission"]
      }).then(({ body: group }) => {
        cy.visit(`/groups/${group.id}`);
        cy.contains("a", "Data Sources").click();
        
        // Add a datasource
        cy.contains("button", "Add Data Sources").click();
        
        // Search and select a datasource
        cy.get("input[placeholder='Search data sources...']").type("Test PostgreSQL");
        cy.contains("Test PostgreSQL").click();
        
        // Click Add button
        cy.get(".ant-modal").within(() => {
          cy.contains("button", "Add").click();
        });
        
        // Verify it was added as view-only
        cy.contains("button", "View Only").should("exist");
        
        // Verify dropdown only shows View Only option
        cy.contains("button", "View Only").click();
        cy.get(".ant-dropdown-menu").within(() => {
          cy.contains("View Only").should("exist");
          cy.contains("Full Access").should("not.exist");
        });
      });
    });
  });
}); 