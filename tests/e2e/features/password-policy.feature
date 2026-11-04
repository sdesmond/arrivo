@feat:password-policy
Feature: Configurable password rules
  Admins set the rules for new passwords in Manage app > Security. Each scenario runs against its own isolated app, so
  changing the rules here never affects another scenario.

  Scenario: An admin saves rules and they survive a reload
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    And the "admin" browser is signed in as the policy admin
    When the "admin" browser opens the Security settings
    And the "admin" browser sets "Maximum length" to "15"
    And the "admin" browser sets "Minimum uppercase letters" to "2"
    And the "admin" browser sets "Minimum numbers" to "2"
    And the "admin" browser sets "Minimum special characters" to "2"
    And the "admin" browser saves the password rules
    Then the "admin" browser finishes saving password rules without an inline success message
    When the "admin" browser reloads the Security settings
    Then the "admin" browser shows the password rule values "Minimum length=8, Maximum length=15, Minimum uppercase letters=2, Minimum numbers=2, Minimum special characters=2"
    And the stored password rules are 8 to 15, requiring 2 uppercase, 2 numbers and 2 special characters

  Scenario Outline: Impossible or malformed rules are refused and the saved rules stay
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    And the "admin" browser is signed in as the policy admin
    When the "admin" browser opens the Security settings
    And the "admin" browser sets "Minimum length" to "<min>"
    And the "admin" browser sets "Maximum length" to "<max>"
    And the "admin" browser sets "Minimum uppercase letters" to "<upper>"
    And the "admin" browser sets "Minimum numbers" to "<numbers>"
    And the "admin" browser sets "Minimum special characters" to "<special>"
    And the "admin" browser tries to save invalid password rules
    Then the "admin" browser shows the password rules error "<error>"
    And the "admin" browser has focus on "<focus>"
    And the stored password rules are still the defaults
    When the "admin" browser reloads the Security settings
    Then the "admin" browser shows the password rule values "Minimum length=8, Maximum length=20, Minimum uppercase letters=0, Minimum numbers=0, Minimum special characters=0"

    Examples:
      | min | max | upper | numbers | special | error                                    | focus                      |
      | 16  | 15  | 0     | 0       | 0       | can't be greater than maximum length     | Minimum length             |
      | 8   | 15  | 6     | 5       | 5       | add up to 16                             | Maximum length             |
      | 8.5 | 20  | 0     | 0       | 0       | Minimum length must be a whole number    | Minimum length             |
      | 8   |     | 0     | 0       | 0       | Maximum length must be a whole number    | Maximum length             |
      | 8   | 20  | -1    | 0       | 0       | Uppercase minimum must be a whole number | Minimum uppercase letters  |
      | 8   | 20  | 0     | 21      | 0       | Number minimum must be a whole number    | Minimum numbers            |
      | 8   | 20  | 0     | 0       |         | Special character minimum must be a whole number | Minimum special characters |

  Scenario: Members cannot reach the rules and direct saves outside admin authority change nothing
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    And the "member" browser is signed in as the policy member
    Then the "member" browser cannot open the Security settings
    When the policy member tries to save valid password rules directly
    Then the direct save is refused as forbidden
    And the stored password rules are still the defaults
    When the policy admin tries to save impossible password rules directly
    Then the direct save is refused as invalid
    And the stored password rules are still the defaults

  Scenario: A stale save is rejected and needs another deliberate save
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    And the "first" browser is signed in as the policy admin
    And the "second" browser is signed in as the policy admin
    When the "first" browser opens the Security settings
    And the "second" browser opens the Security settings
    And the "second" browser sets "Minimum length" to "10"
    And the "second" browser saves the password rules
    Then the "second" browser finishes saving password rules without an inline success message
    When the "first" browser sets "Maximum length" to "18"
    And the "first" browser saves the password rules
    Then the "first" browser shows the password rules error "changed elsewhere"
    And the "first" browser shows the password rule values "Minimum length=10, Maximum length=20"
    And the stored password rules are 10 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    When the "first" browser sets "Maximum length" to "18"
    And the "first" browser saves the password rules
    Then the "first" browser finishes saving password rules without an inline success message
    And the stored password rules are 10 to 18, requiring 0 uppercase, 0 numbers and 0 special characters

  Scenario: Existing passwords outside the new limits still sign in
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    When the stored password rules are changed to 16 to 20 behind the app
    And the policy member signs in with their original password in the "member" browser
    Then the policy member's stored password and sessions are untouched

  Scenario: The first-run setup page shows a live checklist and enforces the rules
    Given an isolated first-run app with password rules 8 to 15, requiring 1 uppercase, 1 numbers and 1 special characters
    When the "visitor" browser opens the "setup" password form
    Then the "visitor" browser lists the password requirements "8 to 15 characters|At least 1 uppercase letter|At least 1 number|At least 1 special character" before typing
    When the "visitor" browser starts watching for requests
    And the "visitor" browser types "abc" into the new password field of the "setup" form
    Then the "visitor" browser shows 0 requirements met
    When the "visitor" browser types "abcdefgh" into the new password field of the "setup" form
    Then the "visitor" browser shows the requirement "8 to 15 characters" as met
    And the "visitor" browser shows 1 requirements met
    When the "visitor" browser types "Abcdefg1!" into the new password field of the "setup" form
    Then the "visitor" browser shows 4 requirements met
    When the "visitor" browser deletes the last character in the new password field of the "setup" form
    Then the "visitor" browser shows the requirement "At least 1 special character" as unmet
    And the "visitor" browser shows 3 requirements met
    And the "visitor" browser shows no failure marks
    When the "visitor" browser clears the new password field of the "setup" form
    Then the "visitor" browser shows 0 requirements met
    And the "visitor" browser has made no request
    When the "visitor" browser submits the "setup" form with the password "abcdefgh" and it is refused
    Then the "visitor" browser shows the password error "Password must be 8 to 15 characters, with at least 1 uppercase letter, at least 1 number and at least 1 special character."
    And no first-run admin account exists
    When the "visitor" browser submits the "setup" form with the password "Valid-pass-1!" and it is accepted
    Then the "visitor" browser lands on "/trips"
    And the first-run admin's stored password matches "Valid-pass-1!"

  Scenario: The account setup dialog shows a live checklist and enforces the rules
    Given an isolated app with password rules 8 to 15, requiring 1 uppercase, 1 numbers and 1 special characters
    When the "recipient" browser opens the "account setup" password form
    Then the "recipient" browser lists the password requirements "8 to 15 characters|At least 1 uppercase letter|At least 1 number|At least 1 special character" before typing
    When the "recipient" browser types "Abcdefg1!" into the new password field of the "account setup" form
    Then the "recipient" browser shows 4 requirements met
    When the "recipient" browser deletes the last character in the new password field of the "account setup" form
    Then the "recipient" browser shows the requirement "At least 1 special character" as unmet
    And the "recipient" browser shows no failure marks
    When the "recipient" browser submits the "account setup" form with the password "abcdefgh" and it is refused
    Then the "recipient" browser shows the password error "Password must be 8 to 15 characters, with at least 1 uppercase letter"
    And the policy pending's stored password does not match "abcdefgh"
    When the "recipient" browser submits the "account setup" form with the password "Valid-pass-1!" and it is accepted
    Then the "recipient" browser lands on "/trips"
    And the policy pending's stored password matches "Valid-pass-1!"

  Scenario: The password reset page shows a live checklist and enforces the rules
    Given an isolated app with password rules 8 to 15, requiring 1 uppercase, 1 numbers and 1 special characters
    When the "recipient" browser opens the "reset" password form
    Then the "recipient" browser lists the password requirements "8 to 15 characters|At least 1 uppercase letter|At least 1 number|At least 1 special character" before typing
    When the "recipient" browser types "Abcdefg1!" into the new password field of the "reset" form
    Then the "recipient" browser shows 4 requirements met
    When the "recipient" browser clears the new password field of the "reset" form
    Then the "recipient" browser shows 0 requirements met
    When the "recipient" browser submits the "reset" form with the password "abcdefgh" and it is refused
    Then the "recipient" browser shows the password error "Password must be 8 to 15 characters, with at least 1 uppercase letter"
    And the policy member's stored password matches "member-pass-1"
    When the "recipient" browser submits the "reset" form with the password "Valid-pass-1!" and it is accepted
    Then the "recipient" browser lands on "/sign-in"
    And the policy member's stored password matches "Valid-pass-1!"

  Scenario: Rules that tighten while a form is open apply to the submission, not to the stale page
    Given an isolated app with password rules 8 to 20, requiring 0 uppercase, 0 numbers and 0 special characters
    When the "recipient" browser opens the "reset" password form
    Then the "recipient" browser lists the password requirements "8 to 20 characters" before typing
    And the "recipient" browser does not list a requirement for "uppercase"
    When the stored password rules are changed to 12 to 20 behind the app
    And the "recipient" browser submits the "reset" form with the password "shortpass1" and it is refused
    Then the "recipient" browser shows the password error "Password must be 12 to 20 characters."
    And the "recipient" browser lists the password requirements "12 to 20 characters"
    And the policy member's stored password matches "member-pass-1"

  Scenario: The admin recovery page shows a live checklist and enforces the rules
    Given an isolated app with password rules 8 to 15, requiring 1 uppercase, 1 numbers and 1 special characters
    When the "operator" browser opens the "recovery" password form
    Then the "operator" browser lists the password requirements "8 to 15 characters|At least 1 uppercase letter|At least 1 number|At least 1 special character" before typing
    When the "operator" browser types "Abcdefg1!" into the new password field of the "recovery" form
    Then the "operator" browser shows 4 requirements met
    When the "operator" browser deletes the last character in the new password field of the "recovery" form
    Then the "operator" browser shows the requirement "At least 1 special character" as unmet
    And the "operator" browser shows no failure marks
    When the "operator" browser submits the "recovery" form with the password "abcdefgh" and it is refused
    Then the "operator" browser shows the password error "Password must be 8 to 15 characters, with at least 1 uppercase letter"
    And the policy admin's stored password matches "admin-pass-1"
    When the "operator" browser submits the "recovery" form with the password "Valid-pass-1!" and it is accepted
    Then the "operator" browser is shown the recovery codes
    And the policy admin's stored password matches "Valid-pass-1!"

  Scenario: The profile password change shows a live checklist and enforces the rules
    Given an isolated app with password rules 8 to 15, requiring 1 uppercase, 1 numbers and 1 special characters
    When the "member" browser opens the "profile" password form
    Then the "member" browser lists the password requirements "8 to 15 characters|At least 1 uppercase letter|At least 1 number|At least 1 special character" before typing
    When the "member" browser types "Abcdefg1!" into the new password field of the "profile" form
    Then the "member" browser shows 4 requirements met
    When the "member" browser deletes the last character in the new password field of the "profile" form
    Then the "member" browser shows the requirement "At least 1 special character" as unmet
    And the "member" browser shows no failure marks
    When the "member" browser submits the "profile" form with the password "abcdefgh" and it is refused
    Then the "member" browser shows the password error "Password must be 8 to 15 characters, with at least 1 uppercase letter"
    And the policy member's stored password matches "member-pass-1"
    When the "member" browser submits the "profile" form with the password "Valid-pass-1!" and it is accepted
    Then the "member" browser lands on "/sign-in"
    And the policy member's stored password matches "Valid-pass-1!"
