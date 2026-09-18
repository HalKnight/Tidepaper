/*
MIT License

Copyright (c) [2017] [Hal Knight]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */
$(function() {
	var csrfToken = $('meta[name="csrf-token"]').attr('content');
	$(document).ajaxSend(function(event, xhr) {
		if (csrfToken) {
			xhr.setRequestHeader('X-CSRF-Token', csrfToken);
		}
	});

	$('#post-comment').hide();
  $('#btn-comment').off('click');
	$('#btn-comment').on('click', function(event) {
		event.preventDefault();
		$('#post-comment').toggle();
	});

  $('.prePublishButton').off('click');
	$('.prePublishButton').on('click', function(event) {
		$("[title='Source']").click();
		setTimeout(function() {
			$('.blogbody').text($('.Editor-editor').text());
			setTimeout(function() {
				$('.publishButton').click();
			}, 500);
		}, 500);
	});

  $('.updateProfile').off('click');
	$('.updateProfile').on('click', function(event) {
		$('.editProfileButton').click();
		setTimeout(function() {
			$('.editProfileButton').click();
			alert($("#adminTxt").val());
			if ($("#adminTxt").val() == "true") {
				$("#admin").attr("checked", "checked");
			} else {
				$("#admin").attr("checked", "");
			}
		}, 500);
	});

	var $stats = $('.stats');
	var $mainBlog = $('div.mainBlog');
	$('.hamburger').off('click.hamburger').on('click.hamburger',
			function(event) {
				event.preventDefault();
				if (!$stats.length) {
					return;
				}
				$mainBlog.toggleClass('col-sm-8');
				$stats.toggleClass('sidebar-visible');
				$(this).attr('aria-expanded', $stats.hasClass('sidebar-visible') ? 'true' : 'false');
			});

  $('#btn-like').off('click');
	$('#btn-like').on('click', function(event) {
		event.preventDefault();

		var postId = $(this).data('id');

		$.post('/articles/' + postId + '/like').done(function(data) {
			$('.likes-count').text(data.likes);
		});
	});

  $('.delete-post').off('click');
	$('.delete-post').on('click', function(event) {
		event.preventDefault();

		var $this = $(this);

		var remove = confirm('Are you sure you want to delete this post?');
		if (remove) {

			var postId = $(this).data('id');

			$.ajax({
				url : '/articles/' + postId,
				type : 'DELETE'
			}).done(function(result) {
				if (result) {
					setTimeout(function() {
						location.reload();
					}, 0);
				}
			});
		}
	});
  
  $('.delete-comment').off('click');
	$('.delete-comment').on('click', function(event) {
		event.preventDefault();

		var $this = $(this);

		var remove = confirm('Are you sure you want to delete this comment?');
		if (remove) {

			var postId = $(this).data('id');
      
			$.ajax({
				url : '/articles/' + postId + '/commentdelete',
				type : 'DELETE'
			}).done(function(result) {
				if (result) {
					setTimeout(function() {
						location.reload();
					}, 0);
				}
			});
		}
	});
  
  $('#searchByAuthor').on('click', function(event) {
		event.preventDefault();

			var name = $('#searchByAuthorName').val();
      
			location = "/home/" + encodeURIComponent(name) + "/searchbyauthor";
		
	});

  $('#searchByDate').on('click', function(event) {
		event.preventDefault();

			var from = $('#searchByDateFrom').val();
			var to = $('#searchByDateTo').val();

			if (!from || !to || from > to) {
				return;
			}

			location = "/home/searchbydate?from=" + encodeURIComponent(from) +
				"&to=" + encodeURIComponent(to);
		});

});