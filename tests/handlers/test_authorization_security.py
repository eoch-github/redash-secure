"""
Test authorization security fixes for critical, high, and medium risk issues.
"""
import pytest
from flask import url_for
from tests import BaseTestCase
from redash import models
from redash.models import db


class AuthorizationSecurityTestCase(BaseTestCase):
    def setUp(self):
        super(AuthorizationSecurityTestCase, self).setUp()
        
        # Create test users with different permission levels
        self.admin_user = self.factory.create_admin()
        self.regular_user = self.factory.create_user()
        
        # Create a view-only group and user
        self.view_only_group = self.factory.create_group(
            name="View Only Group",
            permissions=["view_query", "view_dashboard", "execute_query"],
            is_view_only=True
        )
        self.view_only_user = self.factory.create_user(group_ids=[self.view_only_group.id])
        
        # Create test objects
        self.dashboard = self.factory.create_dashboard(user=self.admin_user)
        
        # Create a data source and give groups access to it
        self.data_source = self.factory.create_data_source()
        self.data_source.add_group(self.view_only_group, view_only=True)
        self.data_source.add_group(self.factory.default_group, view_only=False)
        db.session.commit()
        
        # Create query with the data source that has group access
        self.query = self.factory.create_query(user=self.admin_user, data_source=self.data_source)
        self.alert = self.factory.create_alert(user=self.admin_user, query_rel=self.query)
        
        # Create API key for dashboard
        self.dashboard_api_key = models.ApiKey.create_for_object(self.dashboard, self.admin_user)
        db.session.commit()


class TestDashboardFavoriteListAuthorization(AuthorizationSecurityTestCase):
    """Test Issue #1: Missing Authorization - DashboardFavoriteListResource"""
    
    def test_dashboard_favorites_requires_list_dashboards_permission(self):
        """Dashboard favorites endpoint should require 'list_dashboards' permission"""
        # Create a user without list_dashboards permission
        restricted_group = self.factory.create_group(
            name="Restricted Group",
            permissions=["view_query"]  # No dashboard permissions
        )
        restricted_user = self.factory.create_user(group_ids=[restricted_group.id])
        
        # Try to access dashboard favorites as restricted user
        rv = self.make_request(
            "get",
            "/api/dashboards/favorites",
            user=restricted_user
        )
        self.assertEqual(rv.status_code, 403)
    
    def test_dashboard_favorites_allows_authorized_users(self):
        """Dashboard favorites endpoint should allow users with proper permissions"""
        # Regular user should have access
        rv = self.make_request(
            "get",
            "/api/dashboards/favorites",
            user=self.regular_user
        )
        self.assertEqual(rv.status_code, 200)


class TestUserRegenerateApiKeyAuthorization(AuthorizationSecurityTestCase):
    """Test Issue #2: Inconsistent Authorization - UserRegenerateApiKeyResource"""
    
    def test_regenerate_api_key_checks_authorization_before_db_query(self):
        """Should check authorization before attempting to fetch user from database"""
        # Try to regenerate API key for another user
        other_user = self.factory.create_user()
        
        # Regular user trying to regenerate another user's API key
        rv = self.make_request(
            "post",
            f"/api/users/{other_user.id}/regenerate_api_key",
            user=self.regular_user
        )
        self.assertEqual(rv.status_code, 403)
        
        # Should not reveal whether user exists through different error messages
        # Try with non-existent user ID
        rv_nonexistent = self.make_request(
            "post",
            "/api/users/99999/regenerate_api_key",
            user=self.regular_user
        )
        self.assertEqual(rv_nonexistent.status_code, 403)
        
        # Both should return same error to prevent user enumeration
        self.assertEqual(rv.json.get("message"), rv_nonexistent.json.get("message"))
    
    def test_user_can_regenerate_own_api_key(self):
        """Users should be able to regenerate their own API key"""
        old_api_key = self.regular_user.api_key
        
        rv = self.make_request(
            "post",
            f"/api/users/{self.regular_user.id}/regenerate_api_key",
            user=self.regular_user
        )
        
        self.assertEqual(rv.status_code, 200)
        self.assertNotEqual(rv.json["api_key"], old_api_key)


class TestViewOnlyDownloadRestrictions(AuthorizationSecurityTestCase):
    """Test Issue #3: View-Only Users Can Download Results"""
    
    def test_view_only_users_cannot_download_csv(self):
        """View-only users should not be able to download query results as CSV"""
        # Create a query result
        query_result = self.factory.create_query_result(
            data_source=self.query.data_source,
            query_text=self.query.query_text,
            query_hash=self.query.query_hash
        )
        self.query.latest_query_data = query_result
        db.session.commit()
        
        # Try to download as CSV
        rv = self.make_request(
            "get",
            f"/api/queries/{self.query.id}/results/{query_result.id}.csv",
            user=self.view_only_user
        )
        # View-only users are blocked from accessing the query result
        self.assertEqual(rv.status_code, 403)
    
    def test_view_only_users_cannot_download_excel(self):
        """View-only users should not be able to download query results as Excel"""
        query_result = self.factory.create_query_result(
            data_source=self.query.data_source,
            query_text=self.query.query_text,
            query_hash=self.query.query_hash
        )
        self.query.latest_query_data = query_result
        db.session.commit()
        
        rv = self.make_request(
            "get",
            f"/api/queries/{self.query.id}/results/{query_result.id}.xlsx",
            user=self.view_only_user
        )
        # View-only users are blocked from accessing the query result
        self.assertEqual(rv.status_code, 403)
    
    def test_regular_users_can_download_csv(self):
        """Regular users should be able to download query results as CSV"""
        # Create a query result
        query_result = self.factory.create_query_result(
            data_source=self.query.data_source,
            query_text=self.query.query_text,
            query_hash=self.query.query_hash
        )
        self.query.latest_query_data = query_result
        db.session.commit()
        
        # Regular users can download CSV
        rv = self.make_request(
            "get",
            f"/api/queries/{self.query.id}/results/{query_result.id}.csv",
            user=self.regular_user
        )
        self.assertEqual(rv.status_code, 200)
        self.assertEqual(rv.headers['Content-Type'], 'text/csv; charset=UTF-8')


class TestDashboardAccessControl(AuthorizationSecurityTestCase):
    """Test Issue #4: Dashboard Access Control Issues"""
    
    def test_dashboard_access_restricted_by_group(self):
        """Users should only access dashboards available to their groups"""
        # Create a dashboard with restricted access
        restricted_group = self.factory.create_group(name="Restricted Dashboard Group")
        restricted_dashboard = self.factory.create_dashboard(
            user=self.admin_user,
            is_draft=False
        )
        
        # Set dashboard to be accessible only by restricted group
        restricted_dashboard.groups = [restricted_group.id]
        db.session.commit()
        
        # Regular user (not in restricted group) should not have access
        rv = self.make_request(
            "get",
            f"/api/dashboards/{restricted_dashboard.id}",
            user=self.regular_user
        )
        self.assertEqual(rv.status_code, 403)
        
        self.assertIn("don't have permission to access this dashboard", rv.json.get("message", ""))
    
    def test_dashboard_access_allowed_for_group_members(self):
        """Users in the dashboard's groups should have access"""
        # Create a visualization and widget to establish group access
        visualization = self.factory.create_visualization(query_rel=self.query)
        widget = self.factory.create_widget(dashboard=self.dashboard, visualization=visualization)
        db.session.commit()
        
        # Now regular user should have access through the query's data source group
        rv = self.make_request(
            "get",
            f"/api/dashboards/{self.dashboard.id}",
            user=self.regular_user
        )
        
        self.assertEqual(rv.status_code, 200)


class TestAlertCreationPermissions(AuthorizationSecurityTestCase):
    """Test Issue #5: Alert Creation Permission"""
    
    def test_view_only_users_cannot_create_alerts(self):
        """View-only users should not be able to create alerts"""
        alert_data = {
            "name": "Test Alert",
            "query_id": self.query.id,
            "options": {"column": "count", "op": ">", "value": 100},
            "rearm": 300
        }
        
        rv = self.make_request(
            "post",
            "/api/alerts",
            data=alert_data,
            user=self.view_only_user
        )
        self.assertEqual(rv.status_code, 403)
        
        self.assertIn("do not have permission to create alerts", rv.json.get("message", ""))
    
    def test_regular_users_can_create_alerts(self):
        """Regular (non-view-only) users should be able to create alerts"""
        alert_data = {
            "name": "Test Alert",
            "query_id": self.query.id,
            "options": {"column": "count", "op": ">", "value": 100},
            "rearm": 300
        }
        
        rv = self.make_request(
            "post",
            "/api/alerts",
            data=alert_data,
            user=self.regular_user
        )
        
        self.assertEqual(rv.status_code, 200)
        self.assertEqual(rv.json["name"], "Test Alert")


class TestPublicDashboardAccess(AuthorizationSecurityTestCase):
    """Test Issue #6: Public Dashboard Missing Setting Check"""
    
    def test_public_dashboard_respects_org_setting(self):
        """Public dashboard API access should respect organization settings"""
        # Create dashboard with API key
        dashboard = self.factory.create_dashboard()
        self.dashboard_api_key = self.factory.create_api_key(object=dashboard)
        
        # Disable public URLs for the organization
        self.factory.org.set_setting("disable_public_urls", True)
        
        # Try to access public dashboard via API without authentication
        response = self.make_request(
            "get",
            f"/api/dashboards/public/{self.dashboard_api_key.api_key}",
            user=False
        )
        
        # Should return 400 when public URLs are disabled
        self.assertEqual(response.status_code, 400)
        self.assertIn("Public URLs are disabled", response.json["message"])
    
    def test_public_dashboard_accessible_when_enabled(self):
        """Public dashboards API should be accessible when enabled"""
        # Create dashboard with API key
        dashboard = self.factory.create_dashboard()
        
        # Create some widgets for the dashboard
        query = self.factory.create_query()
        visualization = self.factory.create_visualization(query_rel=query)
        widget = self.factory.create_widget(dashboard=dashboard, visualization=visualization)
        
        # Create API key for dashboard
        self.dashboard_api_key = self.factory.create_api_key(object=dashboard)
        
        # Enable public URLs (default)
        self.factory.org.set_setting("disable_public_urls", False)
        
        # Access public dashboard via API without authentication
        response = self.make_request(
            "get",
            f"/api/dashboards/public/{self.dashboard_api_key.api_key}",
            user=False
        )
        
        # Should be accessible
        self.assertEqual(response.status_code, 200)
        self.assertIn("widgets", response.json)


class TestApiKeyVisibility(AuthorizationSecurityTestCase):
    """Test Issue #7: API Key Exposure in User Endpoints"""
    
    def test_users_cannot_see_other_users_api_keys(self):
        """Users should not be able to see other users' API keys"""
        other_user = self.factory.create_user()
        
        rv = self.make_request(
            "get",
            f"/api/users/{other_user.id}",
            user=self.regular_user
        )
        
        self.assertEqual(rv.status_code, 200)
        self.assertNotIn("api_key", rv.json)
    
    def test_users_can_see_own_api_key(self):
        """Users should be able to see their own API key"""
        rv = self.make_request(
            "get",
            f"/api/users/{self.regular_user.id}",
            user=self.regular_user
        )
        
        self.assertEqual(rv.status_code, 200)
        self.assertIn("api_key", rv.json)
        self.assertEqual(rv.json["api_key"], self.regular_user.api_key)
    
    def test_admin_can_see_all_api_keys(self):
        """Admins should be able to see all users' API keys"""
        rv = self.make_request(
            "get",
            f"/api/users/{self.regular_user.id}",
            user=self.admin_user
        )
        
        self.assertEqual(rv.status_code, 200)
        self.assertIn("api_key", rv.json)


if __name__ == "__main__":
    pytest.main([__file__, "-v"]) 