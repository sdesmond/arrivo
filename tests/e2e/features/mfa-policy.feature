@feat:mfa-policy
Feature: Mandatory two-factor enrollment
  Background:
    Given an isolated MFA policy app
    And the "admin" browser is signed in as the policy admin

  Scenario: Instance requirement starts at next sign-in and protects direct endpoints
    Given the "active" browser is signed in as the policy member
    When the admin requires MFA for everyone
    Then the "active" browser still has private app access
    When the "new" browser signs in as the unenrolled policy member
    Then the "new" browser must enroll before accessing private pages or endpoints
    And the "new" browser cannot replay a private policy action

  Scenario: Individual requirement can be removed without changing instance precedence
    When the admin requires MFA for the policy member
    And the "new" browser signs in as the unenrolled policy member
    Then the "new" browser must enroll before accessing private pages or endpoints
    When the admin requires MFA for everyone
    Then individual MFA switches inherit the instance requirement
    And the "new" browser must enroll before accessing private pages or endpoints
    When the admin removes the instance MFA requirement
    Then all individual MFA requirements are off and editable
    And the "new" browser still has private app access

  Scenario: Mandatory enrollment saves codes before fresh sign-in and preserves remembered browsers and recovery
    When the admin requires MFA for the policy member
    And the "new" browser signs in as the unenrolled policy member
    And the "new" browser completes required enrollment
    Then the "new" browser must acknowledge recovery codes before fresh sign-in
    When the "new" browser signs in with a code and remembers this browser
    Then the "new" browser cannot disable required MFA
    When the "new" browser signs out and signs in again
    Then the "new" browser still has private app access
    When a fresh browser signs in using a mandatory MFA recovery code
    Then that recovery code cannot be reused
    When the admin removes the policy member MFA requirement
    Then the enrolled policy member still needs MFA in a fresh browser

  Scenario: Admin can require their own enrollment at next sign-in
    When the admin requires MFA for everyone
    Then the "admin" browser still has private app access
    When the "admin-next" browser signs in as the unenrolled policy admin
    Then the "admin-next" browser must enroll before accessing private pages or endpoints

  Scenario: Enabling policy wins over a waiting MFA disable without consuming credentials
    When the admin requires MFA for the policy member
    And the "new" browser signs in as the unenrolled policy member
    And the "new" browser completes required enrollment
    Then the "new" browser must acknowledge recovery codes before fresh sign-in
    When the "new" browser signs in with a code and remembers this browser
    And the admin removes the policy member MFA requirement
    Then overlapping instance enable and member disable preserve enrolled MFA
