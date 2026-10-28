@feat:account-setup
Feature: Setup-only account context
  A setup link opens a limited, setup-only context that never reaches app data and never consumes the link.

  Scenario: Opening a setup link twice shows the setup dialog without exposing the token
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    Then I see the account setup dialog for the pending account
    And the address has no token
    When I open the setup link
    Then I see the account setup dialog for the pending account
    And the setup link is still valid with its original expiry

  Scenario: The setup dialog cannot be dismissed
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And I try to dismiss the setup dialog
    Then I see the account setup dialog for the pending account

  Scenario Outline: The setup context cannot reach app data
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    Then requesting "<path>" with only the setup context redirects to sign-in

    Examples:
      | path                  |
      | /trips                |
      | /api/storage/x.jpg    |
      | /api/users/me/events  |

  Scenario Outline: An unusable setup link shows only the generic unavailable page
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open a setup link that is <kind>
    Then I see the setup link unavailable page
    And no setup context cookie was set

    Examples:
      | kind      |
      | malformed |
      | unknown   |
      | replaced  |
      | expired   |

  Scenario: A held setup context stops working when the link is replaced
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And the setup link is replaced
    And I reload the page
    Then I see the setup link unavailable page

  Scenario: A held setup context stops working when the account is deleted
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And the pending account is deleted
    And I reload the page
    Then I see the setup link unavailable page

  Scenario: Exchange and page responses are never cached and send no referrer
    Given the instance is already set up
    And a pending account with a fresh setup link
    Then the setup exchange response is not cacheable and sends no referrer
    When I open the setup link
    Then the setup page response is not cacheable and sends no referrer

  Scenario Outline: First-run entries stay closed on an initialized instance
    Given the instance is already set up
    When I open bootstrap entry "<path>"
    Then I see the sign-in screen

    Examples:
      | path     |
      | /setup   |
      | /sign-up |
