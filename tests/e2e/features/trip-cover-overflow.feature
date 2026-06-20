Feature: Trip cover overflow menu

  Background:
    Given I am signed in

  Scenario: User selects an Unsplash cover and views attribution info
    Given I have an existing trip with a photo destination
    When I open the cover options menu
    And I choose the first stub cover photo
    And I open the cover options menu
    And I open the cover attribution dialog
    Then the cover attribution dialog shows the stub photographer

  Scenario: User removes a photo cover and menu items update
    Given I have an existing trip with a photo destination
    And I already selected the first stub cover photo
    When I open the cover options menu
    And I remove the current cover photo
    And I open the cover options menu
    Then the cover options menu hides remove and info actions
    When I reload the trip detail page
    And I open the cover options menu
    Then the cover options menu hides remove and info actions

  Scenario: User uploads a custom photo cover from overflow and it persists
    Given I have an existing trip
    When I open the cover picker from the cover options menu
    And I upload a new cover image from the picker
    Then the uploaded cover image persists after reloading the page

  Scenario: User opens the cover picker from the cover options menu
    Given I have an existing trip
    When I open the cover picker from the cover options menu
    Then the cover picker defaults to the Custom tab

  Scenario: Edit sheet contains no cover image controls
    Given I have an existing trip
    When I open the trip edit sheet
    Then I see no cover image editing controls
