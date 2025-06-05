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
        
        # Create data sources without groups initially
        self.data_source1 = self.factory.create_data_source(name="DS1")
        self.data_source2 = self.factory.create_data_source(name="DS2")
        
        # Create queries using Query.create to get default visualizations
        self.query1 = models.Query.create(
            name="Query 1",
            query_text="SELECT 1",
            user=self.regular_user,
            data_source=self.data_source1,
            org=self.factory.org
        )
        self.query2 = models.Query.create(
            name="Query 2", 
            query_text="SELECT 2",
            user=self.regular_user,
            data_source=self.data_source2,
            org=self.factory.org
        )
        models.db.session.add_all([self.query1, self.query2])
        models.db.session.commit()
        
        # Create dashboards with widgets
        self.dashboard1 = self.factory.create_dashboard(name="Dashboard 1")
        self.factory.create_widget(dashboard=self.dashboard1, visualization=self.query1.visualizations[0])
        
        self.dashboard2 = self.factory.create_dashboard(name="Dashboard 2")
        self.factory.create_widget(dashboard=self.dashboard2, visualization=self.query2.visualizations[0])
        
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
    
    def test_dashboard_only_user_cannot_see_dashboards_without_datasource_access(self):
        """Test that dashboard-only users cannot see dashboards without datasource access"""
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        self.assertEqual(dashboards.count(), 0)
    
    def test_dashboard_only_user_can_see_dashboards_with_datasource_access(self):
        """Test that dashboard-only users can see dashboards when their group has datasource access"""
        # Add data_source1 to the dashboard-only group
        self.data_source1.add_group(self.dashboard_only_group, view_only=True)
        models.db.session.commit()
        
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        dashboard_ids = [d.id for d in dashboards]
        
        # Should see dashboard1 (uses data_source1) but not dashboard2 (uses data_source2)
        self.assertIn(self.dashboard1.id, dashboard_ids)
        self.assertNotIn(self.dashboard2.id, dashboard_ids)
    
    def test_dashboard_only_user_datasource_based_access(self):
        """Test that dashboard access is based on datasource permissions"""
        # Initially no datasource access
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        self.assertEqual(dashboards.count(), 0)
        
        # Grant access to data_source1
        self.data_source1.add_group(self.dashboard_only_group, view_only=True)
        models.db.session.commit()
        
        # Now should see dashboard1
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        dashboard_ids = [d.id for d in dashboards]
        self.assertIn(self.dashboard1.id, dashboard_ids)
        self.assertNotIn(self.dashboard2.id, dashboard_ids)
        
        # Grant access to data_source2
        self.data_source2.add_group(self.dashboard_only_group, view_only=True)
        models.db.session.commit()
        
        # Now should see both dashboards
        dashboards = models.Dashboard.all_for_dashboard_only_user(self.factory.org, self.dashboard_only_user)
        dashboard_ids = [d.id for d in dashboards]
        self.assertIn(self.dashboard1.id, dashboard_ids)
        self.assertIn(self.dashboard2.id, dashboard_ids)


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
        
        # Create data source and query
        self.data_source = self.factory.create_data_source(name="Test DS")
        self.query = models.Query.create(
            name="Test Query",
            query_text="SELECT 1",
            user=self.admin_user,
            data_source=self.data_source,
            org=self.factory.org
        )
        models.db.session.add(self.query)
        models.db.session.commit()
        
        # Create dashboard with widget
        self.dashboard = self.factory.create_dashboard(name="Test Dashboard")
        self.factory.create_widget(dashboard=self.dashboard, visualization=self.query.visualizations[0])
        
        models.db.session.commit()
    
    def test_dashboard_only_user_cannot_access_dashboard_without_datasource_access(self):
        """Test that dashboard-only users get 403 without datasource access"""
        rv = self.make_request(
            "get",
            "/api/dashboards/{}".format(self.dashboard.id),
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 403)
    
    def test_dashboard_only_user_can_access_dashboard_with_datasource_access(self):
        """Test that dashboard-only users can access dashboards when group has datasource access"""
        # Add data source to the dashboard-only group
        self.data_source.add_group(self.dashboard_only_group, view_only=True)
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
    
    def test_dashboard_list_filters_based_on_datasource_access(self):
        """Test that dashboard list only shows dashboards based on datasource access"""
        # Create another data source and dashboard
        data_source2 = self.factory.create_data_source(name="DS2")
        query2 = models.Query.create(
            name="Query 2",
            query_text="SELECT 2",
            user=self.admin_user,
            data_source=data_source2,
            org=self.factory.org
        )
        models.db.session.add(query2)
        models.db.session.commit()
        
        dashboard2 = self.factory.create_dashboard(name="Dashboard 2")
        self.factory.create_widget(dashboard=dashboard2, visualization=query2.visualizations[0])
        models.db.session.commit()
        
        # Grant access only to the first data source
        self.data_source.add_group(self.dashboard_only_group, view_only=True)
        models.db.session.commit()
        
        rv = self.make_request(
            "get",
            "/api/dashboards",
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 200)
        
        data = rv.json
        dashboard_ids = [d["id"] for d in data["results"]]
        
        # Should only see dashboard1 (uses data_source1 which group has access to)
        self.assertIn(self.dashboard.id, dashboard_ids)
        self.assertNotIn(dashboard2.id, dashboard_ids)
    
    def test_dashboard_with_multiple_datasources(self):
        """Test dashboard visibility when it uses multiple data sources"""
        # Create another data source and add a widget using it to the same dashboard
        data_source2 = self.factory.create_data_source(name="DS2")
        query2 = models.Query.create(
            name="Query 2",
            query_text="SELECT 2",
            user=self.admin_user,
            data_source=data_source2,
            org=self.factory.org
        )
        models.db.session.add(query2)
        models.db.session.commit()
        
        self.factory.create_widget(dashboard=self.dashboard, visualization=query2.visualizations[0])
        models.db.session.commit()
        
        # Grant access only to the first data source
        self.data_source.add_group(self.dashboard_only_group, view_only=True)
        models.db.session.commit()
        
        # Dashboard should be visible if user has access to at least one data source
        rv = self.make_request(
            "get",
            "/api/dashboards/{}".format(self.dashboard.id),
            user=self.dashboard_only_user
        )
        self.assertEqual(rv.status_code, 200) 