context('Login', () => {
  const authUrl = 'https://cognito-idp.ap-northeast-1.amazonaws.com/';
  let unAuthorizedUser;

  before(() => {
    cy.task('generateUser').then((obj) => {
      unAuthorizedUser = obj;
    });
  });
  beforeEach(() => {
    cy.fixture('users.json').as('users');
    cy.fixture('users').as('authenticatedUsers');
  });

  it('should take user to login screen on page load', () => {
    cy.visit('/');
    cy.location().should((location) => {
      expect(location.pathname).eq('/login');
    });
  });

  it('should ensure other pages don’t work without a logged-in user', () => {
    const authenticatedRoutes = ['balance', 'transaction', 'rate'];
    cy.on('uncaught:exception', (err, runnable) => false);
    authenticatedRoutes.forEach((route) => {
      cy.visit(`/home/${route}`);
      cy.location().should((location) => {
        expect(location.pathname).eq('/login');
      });
    });
  });

  it('should reject users with invalid credentials', () => {
    const { username, password } = unAuthorizedUser;

    cy.get('#basic_username').type(username).should('have.value', username);
    cy.get('#basic_password').type(password).should('have.value', password);

    cy.intercept('POST', authUrl).as('authRequest');

    cy.get('button').click();

    return cy.wait('@authRequest').then(({ request, response }) => {
      expect(request.url).equal(authUrl);
      expect(response.statusCode).equal(200);
      expect(response.body.ChallengeName).equal('PASSWORD_VERIFIER');

      cy.wait('@authRequest').then(({ request, response }) => {
        expect(request.url).equal(authUrl);
        expect(response.body.message).equal('Incorrect username or password.');
        expect(response.statusCode).equal(400);
      });

      cy.location().should((location) => {
        expect(location.pathname).eq('/login');
      });
    });
  });

  it('should login and logout valid user', function () {
    cy.visit('/login');
    const { username, password } = this.authenticatedUsers[0];

    cy.fixture('users').should((users) => {
      const authorizedUser = users[0];

      expect('username' in authorizedUser).equal(true);
      expect('password' in authorizedUser).equal(true);
    });

    cy.get('#basic_username').type(username).should('have.value', username);
    cy.get('#basic_password').type(password).should('have.value', password);

    cy.intercept('POST', authUrl).as('authRequest');

    cy.get('button').click();

    return cy.wait('@authRequest').then(({ request, response }) => {
      expect(request.url).equal(authUrl);
      expect(response.statusCode).equal(200);
      expect(response.body.ChallengeName).equal('PASSWORD_VERIFIER');

      cy.wait('@authRequest').then(({ request, response }) => {
        expect(request.url).equal(authUrl);
        expect(response.body.message).equal(undefined);
        expect(response.statusCode).equal(200);
      });

      cy.location().should((location) => {
        expect(location.pathname).eq('/home/transaction');
      });

      // prevent animation frame uncaught:exception error from failing test
      cy.on('uncaught:exception', (err, runnable) => false);

      cy.get('[role="menuitem"]:last span:last').should('contain', 'Logout').click();

      cy.wait('@authRequest').then(({ _, response }) => {
        // logout response from server should be 200
        expect(response.statusCode).equal(200);
      });

      cy.location().should((location) => {
        expect(location.pathname).eq('/login');
      });
    });
  });
});
