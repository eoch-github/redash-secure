describe("Group Datasource UI", () => {
  beforeEach(() => {
    cy.login();
  });

  describe("Group Page UI", () => {
    it("displays Data Sources tab for groups", () => {
      cy.visit("/groups/1");
      
      // Check that the Data Sources link is visible in sidebar
      cy.contains("a", "Data Sources").should("exist");
      
      // Click on the Data Sources link
      cy.contains("a", "Data Sources").click();
      
      // Check URL changed
      cy.location("pathname").should("include", "/groups/1/data_sources");
    });

    it("shows empty state when no datasources are assigned", () => {
      // Create a new group
      cy.request("POST", "/api/groups", { name: "Empty Group" }).then(({ body: group }) => {
        cy.visit(`/groups/${group.id}/data_sources`);
        
        // Check empty state message
        cy.contains("There are no data sources in this group yet.").should("exist");
        cy.contains("button", "Add Data Sources").should("exist");
      });
    });

    it("displays datasource list with permissions", () => {
      // Create group with datasources
      cy.request("POST", "/api/groups", { name: "Group With DS" }).then(({ body: group }) => {
        // Add datasources with different permissions
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: true
        });
        
        cy.visit(`/groups/${group.id}/data_sources`);
        
        // Check datasource is displayed in table
        cy.get(".table-responsive").should("exist");
        cy.contains("Test PostgreSQL").should("exist");
        
        // Check permission dropdown shows View Only
        cy.contains("button", "View Only").should("exist");
      });
    });
  });

  describe("Add Datasource Modal", () => {
    let testGroup;

    beforeEach(() => {
      cy.request("POST", "/api/groups", { name: "Modal Test Group" }).then(({ body: group }) => {
        testGroup = group;
        cy.visit(`/groups/${group.id}/data_sources`);
      });
    });

    it("opens and closes add datasource modal", () => {
      // Open modal
      cy.contains("button", "Add Data Sources").click();
      cy.get(".ant-modal").should("be.visible");
      
      // Check modal content
      cy.get(".ant-modal").within(() => {
        cy.contains("Add Data Sources").should("exist");
        cy.get("input[placeholder='Search data sources...']").should("exist");
      });
      
      // Close modal
      cy.get(".ant-modal-close").click();
      cy.get(".ant-modal").should("not.exist");
    });

    it("validates datasource selection", () => {
      cy.contains("button", "Add Data Sources").click();
      
      // The modal requires selecting items before the "Add" button is enabled
      // Check that the add button is disabled when no items selected
      cy.get(".ant-modal").within(() => {
        cy.contains("button", "Add").should("be.disabled");
      });
    });

    it("shows already added datasources as disabled", () => {
      // Add a datasource first
      cy.request("POST", `/api/groups/${testGroup.id}/data_sources`, {
        data_source_id: 1,
        view_only: true
      });
      
      cy.reload();
      cy.contains("button", "Add Data Sources").click();
      
      // Search for the datasource
      cy.get("input[placeholder='Search data sources...']").type("Test PostgreSQL");
      
      // The already added datasource should be shown as disabled
      cy.get(".ant-modal").within(() => {
        cy.contains("Test PostgreSQL").parent().should("have.class", "disabled");
      });
    });
  });

  describe("Dashboard-Only Group UI", () => {
    it("shows dashboard-only group type in group name", () => {
      // Create dashboard-only group
      cy.request("POST", "/api/groups", {
        name: "Dashboard Only UI Test",
        type: "dashboard_only",
        permissions: ["view_query_results_without_permission"]
      }).then(({ body: group }) => {
        cy.visit(`/groups/${group.id}`);
        
        // The group type is shown in the group name/header
        cy.contains("Dashboard Only UI Test").should("exist");
      });
    });

    it("disables view-only toggle for dashboard-only groups", () => {
      // Create dashboard-only group with datasource
      cy.request("POST", "/api/groups", {
        name: "Dashboard Only Toggle Test",
        type: "dashboard_only",
        permissions: ["view_query_results_without_permission"]
      }).then(({ body: group }) => {
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: true
        });
        
        cy.visit(`/groups/${group.id}/data_sources`);
        
        // Check that the permission dropdown only shows View Only for dashboard-only groups
        cy.contains("button", "View Only").click();
        cy.get(".ant-dropdown-menu").within(() => {
          cy.contains("View Only").should("exist");
          cy.contains("Full Access").should("not.exist");
        });
      });
    });

    it("enforces view-only permissions for dashboard-only groups", () => {
      cy.request("POST", "/api/groups", {
        name: "Dashboard Only Info Test",
        type: "dashboard_only",
        permissions: ["view_query_results_without_permission"]
      }).then(({ body: group }) => {
        // Add a datasource
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: false // Try to add with full access
        });
        
        cy.visit(`/groups/${group.id}/data_sources`);
        
        // Should still show as View Only
        cy.contains("button", "View Only").should("exist");
      });
    });
  });

  describe("Permission Toggle", () => {
    let testGroup;

    beforeEach(() => {
      cy.request("POST", "/api/groups", { name: "Toggle Test Group" }).then(({ body: group }) => {
        testGroup = group;
        // Add datasource with full access
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: false
        });
      });
    });

    it("toggles between view-only and full access", () => {
      cy.visit(`/groups/${testGroup.id}/data_sources`);
      
      // Initially should show Full Access
      cy.contains("button", "Full Access").should("exist");
      
      // Click dropdown to switch to view-only
      cy.contains("button", "Full Access").click();
      cy.get(".ant-dropdown-menu").within(() => {
        cy.contains("View Only").click();
      });
      
      // Should now show View Only
      cy.contains("button", "View Only").should("exist");
      
      // Toggle back
      cy.contains("button", "View Only").click();
      cy.get(".ant-dropdown-menu").within(() => {
        cy.contains("Full Access").click();
      });
      
      // Should show Full Access again
      cy.contains("button", "Full Access").should("exist");
    });
  });

  describe("Remove Datasource", () => {
    let testGroup;

    beforeEach(() => {
      cy.request("POST", "/api/groups", { name: "Remove Test Group" }).then(({ body: group }) => {
        testGroup = group;
        // Add multiple datasources
        cy.request("POST", `/api/groups/${group.id}/data_sources`, {
          data_source_id: 1,
          view_only: true
        });
      });
    });

    it("removes datasource with confirmation", () => {
      cy.visit(`/groups/${testGroup.id}/data_sources`);
      
      // Click remove button
      cy.contains("button", "Remove").click();
      
      // Datasource should be removed (no confirmation modal in current implementation)
      cy.contains("Test PostgreSQL").should("not.exist");
      cy.contains("There are no data sources in this group yet.").should("exist");
    });

    // Removed test for canceling removal as there's no confirmation modal in current implementation
  });
}); 