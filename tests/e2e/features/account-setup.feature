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

  Scenario: Completing setup signs in only that account and consumes the link
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And I complete the setup form with name "Alex Pending" and password "chosen-pass-1"
    Then I should be redirected to the trips page
    And the pending account has the name "Alex Pending" and password "chosen-pass-1"
    And Activity holds a setup completed event for the pending account
    When I open the setup link
    Then I see the setup link unavailable page

  Scenario Outline: Invalid setup input shows an error and keeps the link untouched
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And I fill the setup form with name "<name>", password "<password>" and confirmation "<confirmation>"
    And I submit the setup form
    Then I see the setup error "<error>"
    And the setup name field still holds "<name>"
    And the pending account has no password
    And the setup link is still valid with its original expiry

    Examples:
      | name | password      | confirmation  | error                                   |
      | Alex |               |               | Password must be at least 8 characters. |
      | Alex | short         | short         | Password must be at least 8 characters. |
      | Alex | chosen-pass-1 | different-one | Passwords do not match.                 |

  Scenario: A half-finished setup resumes with the same expiry
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And I fill the setup form with name "Alex", password "chosen-pass-1" and confirmation "chosen-pass-1"
    And I reload the page
    Then I see the account setup dialog for the pending account
    And the setup link is still valid with its original expiry

  Scenario: Submitting after the link is replaced saves nothing
    Given the instance is already set up
    And a pending account with a fresh setup link
    When I open the setup link
    And the setup link is replaced
    And I complete the setup form with name "Alex Pending" and password "chosen-pass-1"
    Then I see the setup link unavailable page
    And the pending account has no password

  Scenario: Two simultaneous completions of one link produce exactly one success
    Given the instance is already set up
    And a pending account with a fresh setup link
    When two browsers complete the setup link at the same time
    Then exactly one browser completed setup
    And Activity holds exactly one setup completed event for the pending account

  Scenario: Another signed-in account must explicitly sign out before setup
    Given the instance is already set up
    And a pending account with a fresh setup link
    And I am signed in to a different completed account
    When I open the setup link
    Then I see the explicit setup sign-out prompt
    And my current account still accesses Trips
    And the address has no token
    When I explicitly sign out and continue setup
    Then I see the account setup dialog for the pending account
    And the setup link is still valid with its original expiry
    And the setup cookie retains its original expiry
    And requesting "/trips" with only the setup context redirects to sign-in

  Scenario Outline: Invalidating a held sign-out prompt refuses setup without ending current session
    Given the instance is already set up
    And a pending account with a fresh setup link
    And I am signed in to a different completed account
    When I open the setup link
    Then I see the explicit setup sign-out prompt
    When <invalidation>
    And I explicitly sign out and continue setup
    Then I see the setup link unavailable page
    And my current account still accesses Trips

    Examples:
      | invalidation                |
      | the setup link is replaced  |
      | the held setup link expires |
      | the pending account is deleted |

  Scenario Outline: Already invalid links stay generic for signed-in accounts
    Given the instance is already set up
    And a pending account with a fresh setup link
    And I am signed in to a different completed account
    When I open a setup link that is <kind>
    Then I see the setup link unavailable page
    And the unavailable setup page offers no sign-out control
    And my current account still accesses Trips
    And the pending account has no password

    Examples:
      | kind     |
      | replaced |
      | expired  |
