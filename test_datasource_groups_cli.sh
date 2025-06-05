#!/bin/bash
# Test script for datasource-group permissions using CLI commands

echo "============================================================"
echo "Testing Redash Datasource-Group Permissions via CLI"
echo "============================================================"

# Function to run docker command
run_docker_cmd() {
    docker compose exec -T server python manage.py "$@"
}

# Step 1: Create a dashboard-only group
echo -e "\n1. Creating dashboard-only group..."
run_docker_cmd dashboard-users create-dashboard-only-group default "Dashboard Viewers"

# Step 2: Create a test user and add to dashboard-only group
echo -e "\n2. Creating test user..."
run_docker_cmd users create viewer@example.com "Test Viewer" --password "viewer123" --org default || echo "User might already exist"

echo -e "\n3. Adding user to dashboard-only group..."
run_docker_cmd dashboard-users add-user-to-dashboard-only-group default viewer@example.com "Dashboard Viewers"

# Step 4: Check existing data sources
echo -e "\n4. Listing existing data sources..."
run_docker_cmd ds list --org default

echo -e "\n============================================================"
echo "Manual steps to complete the test:"
echo "============================================================"
echo ""
echo "1. Login to Redash at http://localhost:5001 as admin"
echo ""
echo "2. Create two JSON data sources:"
echo "   - Name: 'Public API Data'"
echo "     URL: https://jsonplaceholder.typicode.com"
echo "   - Name: 'Private API Data'"
echo "     URL: https://jsonplaceholder.typicode.com"
echo ""
echo "3. Go to Settings > Groups > Dashboard Viewers"
echo "   - Click 'Data Sources' tab"
echo "   - Add only 'Public API Data' to the group"
echo ""
echo "4. Create two queries:"
echo "   - Query 1: 'Public Data Query' using 'Public API Data'"
echo "     Query text: posts/1"
echo "   - Query 2: 'Private Data Query' using 'Private API Data'"
echo "     Query text: users/1"
echo ""
echo "5. Create two dashboards:"
echo "   - Dashboard 1: 'Public Dashboard' with widget from Query 1"
echo "   - Dashboard 2: 'Private Dashboard' with widget from Query 2"
echo ""
echo "6. Logout and login as viewer@example.com (password: viewer123)"
echo ""
echo "Expected results:"
echo "✓ Viewer should see 'Public Dashboard'"
echo "✗ Viewer should NOT see 'Private Dashboard'"
echo "✗ Viewer should NOT see Queries menu"
echo "✗ Viewer should NOT be able to create/edit content" 