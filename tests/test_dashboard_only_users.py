from tests import BaseTestCase
from redash import models


class TestDashboardOnlyUsers(BaseTestCase):
    def setUp(self):
        super(TestDashboardOnlyUsers, self).setUp()
        # Create a dashboard-only group
        self.dashboard_only_group = models.Group(
            name="Dashboard Only",
            permissions=models.Group.DASHBOARD_ONLY_PERMISSIONS,
            type=models.Group.DASHBOARD_ONLY_GROUP,
            org=self.factory.org
        )
        models.db.session.add(self.dashboard_only_group)
        models.db.session.commit()  # Commit the group before creating user
        
        # Create a dashboard-only user
        self.dashboard_only_user = self.factory.create_user(group_ids=[self.dashboard_only_group.id])
        
        # Create regular user
        self.regular_user = self.factory.user
        
        # Create some dashboards
        self.dashboard1 = self.factory.create_dashboard()
        self.dashboard2 = self.factory.create_dashboard()
        
        models.db.session.commit()
    
    def test_is_dashboard_only_user(self):
        """Test that is_dashboard_only_user correctly identifies dashboard-only users"""
        self.assertTrue(self.dashboard_only_user.is_dashboard_only_user())
        self.assertFalse(self.regular_user.is_dashboard_only_user())
    
    def test_dashboard_only_user_permissions(self):
        """Test that dashboard-only users have correct permissions"""
        permissions = self.dashboard_only_user.permissions
        self.assertIn("list_dashboards", permissions)
        self.assertNotIn("create_query", permissions)
        self.assertNotIn("create_dashboard", permissions)
    
    def test_dashboard_only_user_cannot_see_dashboards_without_permission(self):
        """Test that dashboard-only users cannot see dashboards without explicit permission"""
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        self.assertEqual(dashboards.count(), 0)
    
    def test_dashboard_only_user_can_see_granted_dashboards(self):
        """Test that dashboard-only users can see dashboards they have permission for"""
        # Grant permission to dashboard1
        models.AccessPermission.grant(
            self.dashboard1,
            "view",
            self.dashboard_only_user,
            self.regular_user
        )
        models.db.session.commit()
        
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        dashboard_ids = [d.id for d in dashboards]
        
        self.assertIn(self.dashboard1.id, dashboard_ids)
        self.assertNotIn(self.dashboard2.id, dashboard_ids)
    
    def test_dashboard_only_user_has_access_check(self):
        """Test that has_access correctly checks permissions for dashboard-only users"""
        # Initially no access
        self.assertFalse(self.dashboard_only_user.has_access(self.dashboard1, "view"))
        
        # Grant permission
        models.AccessPermission.grant(
            self.dashboard1,
            "view",
            self.dashboard_only_user,
            self.regular_user
        )
        models.db.session.commit()
        
        # Now has access
        self.assertTrue(self.dashboard_only_user.has_access(self.dashboard1, "view"))
        # But not to dashboard2
        self.assertFalse(self.dashboard_only_user.has_access(self.dashboard2, "view"))


class TestDashboardAPIWithDashboardOnlyUsers(BaseTestCase):
    def setUp(self):
        super(TestDashboardAPIWithDashboardOnlyUsers, self).setUp()
        # Create a dashboard-only group
        self.dashboard_only_group = models.Group(
            name="Dashboard Only",
            permissions=models.Group.DASHBOARD_ONLY_PERMISSIONS,
            type=models.Group.DASHBOARD_ONLY_GROUP,
            org=self.factory.org
        )
        models.db.session.add(self.dashboard_only_group)
        models.db.session.commit()  # Commit the group before creating user
        
        # Create a dashboard-only user
        self.dashboard_only_user = self.factory.create_user(group_ids=[self.dashboard_only_group.id])
        
        # Create admin user for granting permissions
        self.admin_user = self.factory.create_admin()
        
        # Create dashboard
        self.dashboard = self.factory.create_dashboard()
        models.db.session.commit()
    
    def test_dashboard_only_user_cannot_access_dashboard_without_permission(self):
        """Test that dashboard-only users get 403 without permission"""
        rv = self.make_request(
            "get",
            "/api/dashboards/{}".format(self.dashboard.id),
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 403)
    
    def test_dashboard_only_user_can_access_granted_dashboard(self):
        """Test that dashboard-only users can access dashboards with permission"""
        # Grant permission
        models.AccessPermission.grant(
            self.dashboard,
            "view",
            self.dashboard_only_user,
            self.admin_user
        )
        models.db.session.commit()
        
        rv = self.make_request(
            "get",
            "/api/dashboards/{}".format(self.dashboard.id),
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 200)
        
        # Check response is in public format
        data = rv.json
        self.assertIn("widgets", data)
        self.assertEqual(data["can_edit"], False)  # Should be False for dashboard-only users
    
    def test_dashboard_list_filters_for_dashboard_only_users(self):
        """Test that dashboard list only shows permitted dashboards"""
        # Create another dashboard
        dashboard2 = self.factory.create_dashboard()
        
        # Grant permission only to dashboard1
        models.AccessPermission.grant(
            self.dashboard,
            "view",
            self.dashboard_only_user,
            self.admin_user
        )
        models.db.session.commit()
        
        rv = self.make_request(
            "get",
            "/api/dashboards",
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 200)
        
        data = rv.json
        dashboard_ids = [d["id"] for d in data["results"]]
        
        self.assertIn(self.dashboard.id, dashboard_ids)
        self.assertNotIn(dashboard2.id, dashboard_ids) 