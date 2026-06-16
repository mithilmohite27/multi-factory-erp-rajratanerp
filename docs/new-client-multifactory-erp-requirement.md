Hey team, please review this requirement carefully.

Important note:
Do not modify, refactor, or touch any existing Rajratan ERP / Shree Degaray ERP production code at this stage. This is only for requirement discussion, technical analysis, architecture planning, and deciding the best development approach. Before writing or changing any code, first analyze the requirement and share the best scalable approach.

We have a new ERP client. Initially, I thought they had 6 factories, but after client discussion, the confirmed details are:

Client Business Details:

* Total factories: 3
* Average production: Around 3,000 blocks per day
* Products: 40mm, 60mm, and 80mm paver blocks
* Shift: Single shift
* Payroll: Piece-rate payroll
* Production Entry: Product-wise production entry required
* Billing: GST Invoice + Delivery Note required
* Customer Management: Required
* Purchase Records: Required
* Daily Production Report: Required

Requirement Overview:

This ERP should be developed similar to our existing Rajratan ERP / Shree Degaray ERP system, but with multi-factory support.

The owner should have a Super Admin dashboard where they can view all 3 factories in one place. The owner should be able to see factory-wise and combined dashboards, daily production, product-wise production, stock, sales, dispatch, billing, payments, purchases, payroll, reports, and important alerts/notifications.

The owner should also be able to create users and give access to factory admins, supervisors, or operators. Each user should only be able to access the factory assigned to them.

Recommended Approach:

Instead of creating two separate login systems, we should create one common login system with role-based access control.

After login, the system should check the user role and redirect accordingly:

1. Super Admin / Owner

   * Can access all 3 factories.
   * Can view consolidated company-level dashboard.
   * Can view factory-wise dashboards.
   * Can compare production, dispatch, billing, payments, purchases, payroll, and reports between factories.
   * Can create and manage users.
   * Can assign users to one or more factories.
   * Can control module permissions.
   * Can receive alerts and notifications from all factories.

2. Factory Admin / Supervisor / Operator

   * Can access only their assigned factory.
   * Can do daily entries for their factory only.
   * Can manage production, dispatch, customers, purchases, billing, payroll, and reports based on assigned permissions.
   * Cannot view other factories’ data.
   * Cannot access Super Admin reports unless permission is given.

Technical Architecture Requirement:

Every important record should have a `factoryId`, so all data stays properly separated factory-wise.

Example:

* Production entry should include factoryId.
* Stock should include factoryId.
* Dispatch should include factoryId.
* GST invoice and delivery note should include factoryId.
* Customer records should include factoryId or company-level tagging.
* Purchase records should include factoryId.
* Payroll should include factoryId.
* Reports should support both factory-wise and combined view.
* User access should be controlled using role + factoryId + permissions.

Comparison with Existing Rajratan ERP:

Please compare this client requirement with our existing Rajratan ERP modules and identify what is already available and what needs to be newly developed or upgraded.

Existing Rajratan ERP already has similar modules like:

* Daily Production
* Inventory / Stock
* CRM / Customer Management
* Dispatch
* Billing / Challan
* Payments
* Expenses
* Reports
* Profit & Loss
* Payroll
* Vendor / Purchase-related records

But for this new client, we need to specifically check and confirm these points:

1. Multi-factory support
   If not available, we need to develop this with factoryId-based data separation.

2. Super Admin dashboard
   If not available, we need to develop a consolidated owner dashboard for all factories.

3. Factory-wise user access
   If not available, we need to develop role-based and factory-based access control.

4. Product-wise production entry
   Existing production module should be checked. If it does not properly support 40mm, 60mm, 80mm product-wise entry, we need to update it.

5. Piece-rate payroll
   Existing payroll module should be checked. If it does not support piece-rate calculation based on production or worker output, we need to develop this.

6. GST Invoice
   Existing billing module should be checked. If it does not generate proper GST invoices, we need to develop or upgrade it.

7. Delivery Note
   Existing challan/dispatch module should be checked. If delivery note format is not available, we need to develop it.

8. Purchase Records
   Existing vendor/purchase records should be checked. If purchase entry, supplier details, material purchase, payment status, and purchase reports are not complete, we need to develop this.

9. Daily Production Report
   Existing reports should be checked. If daily production report is not properly available factory-wise and product-wise, we need to develop it.

10. Alerts and Notifications
    If not available, we need to develop alerts for low stock, pending payment, pending dispatch, daily production updates, and factory-wise important activities.

Important ERP Behavior:

* On fresh login or re-login, the user should always be redirected to the main dashboard, not the last visited page.
* Unsaved form values should be preserved during the active logged-in session if the user accidentally switches module, tab, or app.
* Unsaved values should only be cleared after logout, manual reset, or successful submission.
* Google Sheets/API read quota should be optimized using batch reads, caching, duplicate request prevention, and limited refresh logic.
* The system should not repeatedly read data on every page render or module switch.

Final Request:

Please analyze this as a CTO + full-stack development team.

Do not start implementation immediately.

First, share:

1. Best architecture approach
2. Existing Rajratan ERP modules that can be reused
3. Modules that need modification
4. New modules/features that need to be developed
5. Suggested database / Google Sheets structure for multi-factory support
6. User roles and permissions structure
7. Development phases and estimated complexity

Once the approach is reviewed and approved, then we will proceed with development.
