app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

    return {
        restrict: 'E',
        scope: {
            home: '=',
            dashboard: '='
        },
        templateUrl: 'js/common/directives/navbar/navbar.html',
        link: function (scope) {

            scope.items = [
                { label: 'Dashboard', state: 'home' , auth: true},
                { label: 'New Quest', state: 'editor', auth: true }
            ];

            scope.user = null;

            scope.isLoggedIn = function () {
                return AuthService.isAuthenticated();
            };

            var setUser = function () {
                AuthService.getLoggedInUser().then(function (user) {
                    scope.user = user;
                });
            };

            var removeUser = function () {
                scope.user = null;
            };

            setUser();

            $rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
            $rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
            $rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

            // Pretty Scrolling Navbar Effect
            $(window).scroll(function() {
                if ($('.navbar').offset().top > 50 && scope.home) {
                    $('.navbar-fixed-top').addClass('top-nav-collapse');
                } else if (scope.home) {
                    $('.navbar-fixed-top').removeClass('top-nav-collapse');
                }
            });

            // Animated Scroll To Section
            $(function() {
                $('.page-scroll a').bind('click', function() {
                    var $anchor = $(this);
                    $('html, body').stop().animate({
                        scrollTop: $($anchor.attr('href')).offset().top
                    }, 1500, 'easeInOutExpo');
                    event.preventDefault();
                });
            });

        }

    };

});
